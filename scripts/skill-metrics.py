#!/usr/bin/env uv run
"""
等级体系计算脚本 v3.0

基于 reference/level-system.md 的设计规范：
- 技能等级：Lv.1~5，调用+成功率+沉淀多条件升级
- 角色总等级：UNDERSTANDING(30) + SKILL_DEPTH(25) + QUALITY(20) + EXPERIENCE(25) = max 100
- 懂你程度权重最高——不是因为你技能多你就厉害，是因为你懂我所以厉害
- 段位：青铜~神话9段

运行方式：uv run scripts/skill-metrics.py
"""

import json
import math
import os
import re
import subprocess
from datetime import datetime, date
from pathlib import Path


def _find_workspace():
    """向上逐级查找包含 user-skills/ 的目录作为 workspace"""
    env_ws = os.environ.get("MYFLICKER_WORKSPACE")
    if env_ws:
        return Path(env_ws)
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "user-skills").is_dir():
            return current
        current = current.parent
    return current

WORKSPACE = _find_workspace()
DATA_FILE = Path(__file__).parent.parent / "character-data.json"

# ──────────────────────────────────────────────
# 段位定义（v3.0：均匀段位，神话20级有说明）
# ──────────────────────────────────────────────

TIERS = [
    {"name": "青铜", "minLevel": 1,  "maxLevel": 10,  "color": "#cd7f32", "icon": "🥉", "description": "刚起步，正在磨合"},
    {"name": "白银", "minLevel": 11, "maxLevel": 20,  "color": "#c0c0c0", "icon": "🥈", "description": "建立默契，基本可靠"},
    {"name": "黄金", "minLevel": 21, "maxLevel": 30,  "color": "#ffd700", "icon": "🥇", "description": "深度融合，默契伙伴"},
    {"name": "铂金", "minLevel": 31, "maxLevel": 40,  "color": "#e5e4e2", "icon": "💎", "description": "融会贯通，稳定交付"},
    {"name": "钻石", "minLevel": 41, "maxLevel": 50,  "color": "#b9f2ff", "icon": "💠", "description": "精通多域，自驱进化"},
    {"name": "大师", "minLevel": 51, "maxLevel": 60,  "color": "#9370db", "icon": "🏆", "description": "独当一面，体系成熟"},
    {"name": "宗师", "minLevel": 61, "maxLevel": 70,  "color": "#ff6347", "icon": "👑", "description": "炉火纯青，知行合一"},
    {"name": "传说", "minLevel": 71, "maxLevel": 80,  "color": "#ff4500", "icon": "🌟", "description": "超越预期，创造价值"},
    {"name": "神话", "minLevel": 81, "maxLevel": 100, "color": "#ffd700", "icon": "✨", "description": "三千世界，万法皆通"},
]

LAYER_WEIGHTS = {"L1": 4, "L2": 3, "L3": 2, "L4": 0.5}
DEFAULT_SLOTS = {"L1": 6, "L2": 10, "L3": 5, "L4": 20}

# ──────────────────────────────────────────────
# 技能等级计算
# ──────────────────────────────────────────────

SKILL_LEVEL_THRESHOLDS = [
    (1, 0,   0,   0, 0),
    (2, 10,  60,  0, 0),
    (3, 50,  75,  1, 0),
    (4, 200, 85,  3, 0),
    (5, 500, 90,  5, 2),
]

SKILL_LEVEL_NAMES = {1: "萌芽", 2: "生长", 3: "成熟", 4: "精通", 5: "圆满"}
SKILL_LEVEL_ICONS = {1: "🌱", 2: "🌿", 3: "🌳", 4: "⚙️", 5: "✨"}

def compute_skill_level(call_count, success_rate, evolution_events, evolution_cycles):
    for level, min_calls, min_sr, min_ev, min_cycles in reversed(SKILL_LEVEL_THRESHOLDS):
        if call_count >= min_calls and success_rate >= min_sr and evolution_events >= min_ev and evolution_cycles >= min_cycles:
            return level
    return 1

def compute_skill_exp(skill_level, call_count, success_rate):
    exp_ranges = {1: (0, 20), 2: (21, 40), 3: (41, 70), 4: (71, 90), 5: (91, 100)}
    min_exp, max_exp = exp_ranges[skill_level]
    call_progress = min(1.0, call_count / max(1, SKILL_LEVEL_THRESHOLDS[skill_level][1] if skill_level < 5 else 500))
    sr_progress = min(1.0, success_rate / 100)
    progress = 0.6 * call_progress + 0.4 * sr_progress
    exp = min_exp + (max_exp - min_exp) * progress
    return round(exp)

# ──────────────────────────────────────────────
# UNDERSTANDING_SCORE（上限30）—— 懂你程度
# ──────────────────────────────────────────────

def compute_soul_depth(workspace: Path):
    """
    soulDepth（上限10）
    检查 SOUL.md / USER.md / IDENTITY.md 的存在性、字数、个性化内容
    """
    items = 0
    
    # SOUL.md 存在？
    soul_file = workspace / "SOUL.md"
    if soul_file.exists():
        items += 1  # 有灵魂文件
        content = soul_file.read_text(encoding="utf-8", errors="ignore")
        # SOUL.md ≥ 200字？
        if len(content.strip()) >= 200:
            items += 1
        # 有品味/厌恶/立场定义？
        if re.search(r'(品味|厌恶|立场|困惑|人格锚点)', content):
            items += 1
    
    # USER.md 存在？
    user_file = workspace / "USER.md"
    if user_file.exists():
        items += 1
        content = user_file.read_text(encoding="utf-8", errors="ignore")
        if len(content.strip()) >= 200:
            items += 1
    
    # IDENTITY.md 存在？
    identity_file = workspace / "IDENTITY.md"
    if identity_file.exists():
        items += 1
    
    return min(10, items * 2)

def compute_memory_depth(workspace: Path):
    """
    memoryDepth（上限10）
    sqrt(totalMemoryDays / 3)
    """
    memory_dir = workspace / "memory"
    if not memory_dir.exists():
        return 0
    
    total_days = 0
    for f in memory_dir.glob("*.md"):
        # 只计数有实质内容的日期文件
        if f.name in ("INDEX.md", "skill_calls.md", "memory-maintenance.md"):
            continue
        content = f.read_text(encoding="utf-8", errors="ignore")
        if len(content.strip()) >= 50:  # 非空文件
            total_days += 1
    
    return min(10, math.floor(math.sqrt(total_days / 3)))

def compute_habit_depth(workspace: Path):
    """
    habitDepth（上限10）
    从 memory/*.md 和 MEMORY.md 中提取用户习惯/偏好条目数 / 5
    """
    habit_entries = 0
    habit_keywords = ['偏好', '习惯', '喜欢', '讨厌', '厌恶', '铁律', '原则', '风格', '口味', '倾向']
    
    # 扫描 MEMORY.md
    memory_file = workspace / "MEMORY.md"
    if memory_file.exists():
        content = memory_file.read_text(encoding="utf-8", errors="ignore")
        for kw in habit_keywords:
            habit_entries += len(re.findall(kw, content))
    
    # 扫描 memory/*.md
    memory_dir = workspace / "memory"
    if memory_dir.exists():
        for f in memory_dir.glob("*.md"):
            if f.name in ("INDEX.md", "skill_calls.md", "memory-maintenance.md"):
                continue
            content = f.read_text(encoding="utf-8", errors="ignore")
            for kw in habit_keywords:
                habit_entries += len(re.findall(kw, content))
    
    return min(10, math.floor(habit_entries / 5))

def compute_understanding_score(workspace: Path):
    """UNDERSTANDING_SCORE = min(30, soulDepth + memoryDepth + habitDepth)"""
    soul = compute_soul_depth(workspace)
    memory = compute_memory_depth(workspace)
    habit = compute_habit_depth(workspace)
    score = min(30, soul + memory + habit)
    return score, {"soulDepth": soul, "memoryDepth": memory, "habitDepth": habit}

# ──────────────────────────────────────────────
# SKILL_DEPTH_SCORE（上限25）
# ──────────────────────────────────────────────

def compute_skill_depth_score(skills_with_levels: list):
    total = sum(level * LAYER_WEIGHTS[layer] for level, layer in skills_with_levels)
    max_possible = sum(5 * LAYER_WEIGHTS[layer] * DEFAULT_SLOTS[layer] for layer in DEFAULT_SLOTS)
    score = total / max_possible * 25
    return min(25, round(score, 1))

# ──────────────────────────────────────────────
# QUALITY_SCORE（上限20）
# ──────────────────────────────────────────────

def compute_quality_score(evolution_events, skill_updates, reflection_cycles):
    points = evolution_events * 2 + skill_updates * 3 + reflection_cycles * 1
    score = min(20, points / 10)
    return round(score, 1)

# ──────────────────────────────────────────────
# EXPERIENCE_SCORE（上限25）
# ──────────────────────────────────────────────

def compute_experience_score(total_call_count, run_days, community_score):
    call_depth = min(10, math.floor(math.sqrt(total_call_count / 30)))
    day_depth = min(10, math.floor(run_days / 15))
    community_depth = min(5, math.floor(community_score / 10))
    score = min(25, call_depth + day_depth + community_depth)
    return score, {"callDepth": call_depth, "dayDepth": day_depth, "communityDepth": community_depth}

# ──────────────────────────────────────────────
# 总等级
# ──────────────────────────────────────────────

def compute_total_level(understanding, depth, quality, experience):
    return math.floor(understanding + depth + quality + experience)

def get_tier(level):
    for tier in TIERS:
        if level >= tier["minLevel"] and level <= tier["maxLevel"]:
            return tier
    # level < 1 时返回青铜段（最低段）
    return TIERS[0]

# ──────────────────────────────────────────────
# 数据源扫描
# ──────────────────────────────────────────────

def scan_skill_calls():
    calls_file = WORKSPACE / "memory" / "skill_calls.md"
    skill_stats = {}
    if not calls_file.exists():
        return skill_stats
    content = calls_file.read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r'\n## ', content)
    for block in blocks:
        header_match = re.match(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*\|\s*(\S+)\s*\|', block)
        if not header_match:
            continue
        skill_name = header_match.group(2)
        result_match = re.search(r'结果:\s*(成功|失败|部分成功)', block)
        if skill_name not in skill_stats:
            skill_stats[skill_name] = {"calls": 0, "successes": 0, "failures": 0}
        skill_stats[skill_name]["calls"] += 1
        if result_match:
            result = result_match.group(1)
            if result == "成功":
                skill_stats[skill_name]["successes"] += 1
            elif result == "失败":
                skill_stats[skill_name]["failures"] += 1
            else:
                skill_stats[skill_name]["successes"] += 0.5
    return skill_stats

def scan_evolution_logs():
    skill_evolution = {}
    skills_dir = WORKSPACE / "user-skills"
    if not skills_dir.exists():
        return skill_evolution
    for skill_dir in skills_dir.glob("*/"):
        evo_log = skill_dir / "evolution-log.md"
        skill_name = skill_dir.name
        events = 0
        cycles = 0
        if evo_log.exists():
            content = evo_log.read_text(encoding="utf-8", errors="ignore")
            event_headers = re.findall(r'^##\s+', content, re.MULTILINE)
            events = len(event_headers) - 1 if event_headers else 0
            cycles = len(re.findall(r'进化\s*(cycle|闭环|迭代|轮)', content, re.IGNORECASE))
        skill_evolution[skill_name] = {"events": max(events, 0), "cycles": cycles}
    return skill_evolution

def scan_skill_updates():
    update_count = 0
    skills_dir = WORKSPACE / "user-skills"
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "--follow", "--", "**/SKILL.md"],
            cwd=str(skills_dir), capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            update_count = len(result.stdout.strip().split('\n'))
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    if update_count == 0:
        for skill_dir in skills_dir.glob("*/"):
            skill_file = skill_dir / "SKILL.md"
            if skill_file.exists():
                update_count += 1
    return update_count

def scan_reflection_cycles():
    cycles = 0
    memory_dir = WORKSPACE / "memory"
    if not memory_dir.exists():
        return cycles
    for f in memory_dir.glob("*.md"):
        if f.name in ("INDEX.md", "skill_calls.md", "memory-maintenance.md"):
            continue
        content = f.read_text(encoding="utf-8", errors="ignore")
        if re.search(r'(修炼|step3|step4|daily-reflection)', content, re.IGNORECASE):
            cycles += 1
    return cycles

def scan_community_score():
    return 0  # 未来接入ClawBook API

def get_run_days(birth_date_str):
    try:
        birth = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
        return (date.today() - birth).days
    except ValueError:
        return 1

def call_count_to_frequency(call_count):
    if call_count > 100:
        return "每日"
    elif call_count >= 30:
        return "每周"
    elif call_count >= 10:
        return "2次/月"
    elif call_count >= 3:
        return "1次/月"
    else:
        return "低频"

def determine_skill_layer(skill_name, skill_data):
    l1_names = ["formless-power", "evo-meta-execution", "evo-daily-reflection",
                "evo-learn-from-mistakes", "evo-knowledge-base", "evo-knowledge-curator"]
    l2_prefixes = ["sl-meta-", "evo-essence-insight", "evo-knowledge-acquisition-meta"]
    l4_platforms = ["Root", "Platform"]
    if skill_name in l1_names:
        return "L1"
    if any(skill_name.startswith(p) for p in l2_prefixes):
        return "L2"
    platform = skill_data.get("platform", "")
    platform_label = skill_data.get("platformLabel", "")
    if platform in l4_platforms or "系统级" in platform_label:
        return "L4"
    return "L3"

# ──────────────────────────────────────────────
# 主流程
# ──────────────────────────────────────────────

def _sync_skills_from_workspace(data, workspace):
    """扫描workspace/user-skills/和workspace/skills/，同步到character-data.json"""
    
    l1_names = ["formless-power", "evo-meta-execution", "evo-daily-reflection",
                "evo-learn-from-mistakes", "evo-knowledge-base", "evo-knowledge-curator"]
    l2_prefixes = ["sl-meta-", "evo-essence-insight", "evo-knowledge-acquisition-meta"]
    layer_cats = {"L1": "⚡ 引擎层", "L2": "🧠 元能力层", "L3": "🔍 题域层", "L4": "🛠️ 工具层"}
    
    existing_names = set()
    for cat_data in data["skills"]["categories"].values():
        sk = cat_data.get("skills", [])
        if isinstance(sk, list):
            for s in sk: existing_names.add(s["name"])
        elif isinstance(sk, dict):
            for sub_data in sk.values():
                inner = sub_data.get("skills", [])
                if isinstance(inner, list):
                    for s in inner: existing_names.add(s["name"])
    
    added = 0
    
    # user-skills/ (L1/L2/L3)
    user_skills_dir = workspace / "user-skills"
    if user_skills_dir.exists():
        for skill_dir in user_skills_dir.glob("*/"):
            skill_name = skill_dir.name
            if skill_name in existing_names: continue
            layer = "L1" if skill_name in l1_names else                     "L2" if any(skill_name.startswith(p) for p in l2_prefixes) else "L3"
            cat_key = layer_cats[layer]
            if cat_key not in data["skills"]["categories"]:
                data["skills"]["categories"][cat_key] = {"name": cat_key, "description": "", "skills": []}
            data["skills"]["categories"][cat_key]["skills"].append({
                "name": skill_name, "fullName": skill_name, "icon": "🌱",
                "level": 1, "exp": 5, "callCount": 0, "successRate": 70,
                "frequency": "低频", "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
                "levelName": "萌芽", "levelIcon": "🌱", "platform": "User",
                "platformLabel": "定制技能" if layer == "L2" else "引擎技能" if layer == "L1" else "业务技能",
                "category": f"L{layer[1]}-{layer_cats[layer].split()[1]}", "status": "active"
            })
            existing_names.add(skill_name)
            added += 1
    
    # skills/ (L4)
    skills_dir = workspace / "skills"
    if skills_dir.exists():
        cat_key = "🛠️ 工具层"
        if cat_key not in data["skills"]["categories"]:
            data["skills"]["categories"][cat_key] = {"name": "🛠️ 工具层", "description": "平台技能", "skills": []}
        for skill_dir in skills_dir.glob("*/"):
            skill_name = skill_dir.name
            if skill_name in existing_names or not skill_dir.is_dir() or skill_name == "config.json": continue
            desc = skill_name
            config_file = skill_dir / "config.json"
            if config_file.exists():
                try:
                    with open(config_file, "r", encoding="utf-8", errors="ignore") as cf:
                        config = json.load(cf)
                    desc = config.get("description", config.get("name", skill_name))[:100]
                except: pass
            data["skills"]["categories"][cat_key]["skills"].append({
                "name": skill_name, "fullName": desc, "icon": "🔧",
                "level": 1, "exp": 5, "callCount": 0, "successRate": 70,
                "frequency": "低频", "lastUpdated": datetime.now().strftime("%Y-%m-%d"),
                "levelName": "萌芽", "levelIcon": "🌱", "platform": "Platform",
                "platformLabel": "平台技能", "category": "L4-工具层", "status": "active"
            })
            existing_names.add(skill_name)
            added += 1
    
    # Update total
    total = 0
    for cat_data in data["skills"]["categories"].values():
        sk = cat_data.get("skills", [])
        if isinstance(sk, list): total += len(sk)
        elif isinstance(sk, dict):
            for sub_data in sk.values():
                inner = sub_data.get("skills", [])
                if isinstance(inner, list): total += len(inner)
    data["skills"]["total"] = total
    
    if added > 0:
        print(f"  🔄 从workspace同步了 {added} 个新技能到character-data.json")




def update_character_data():
    if not DATA_FILE.exists():
        print(f"数据文件不存在: {DATA_FILE}")
        return

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    # ── 同步workspace实际技能到character-data.json ──
    _sync_skills_from_workspace(data, WORKSPACE)

    # ── 扫描数据源 ──
    skill_calls = scan_skill_calls()
    skill_evolution = scan_evolution_logs()
    skill_updates = scan_skill_updates()
    reflection_cycles = scan_reflection_cycles()
    community_score = scan_community_score()
    birth_date = data["character"].get("birthDate", "2026-02-01")
    run_days = get_run_days(birth_date)

    # ── 计算懂你程度 ──
    understanding_score, understanding_detail = compute_understanding_score(WORKSPACE)

    # ── 计算每个技能的新等级 ──
    skills_with_levels = []
    total_call_count = 0
    total_evolution_events = 0

    for cat_name, cat_data in data["skills"]["categories"].items():
        if not isinstance(cat_data, dict) or "skills" not in cat_data:
            continue
        skills_list = cat_data["skills"]
        if isinstance(skills_list, dict):
            for sub_name, sub_data in skills_list.items():
                inner = sub_data.get("skills", [])
                if isinstance(inner, list):
                    for s in inner:
                        _update_one_skill(s, skill_calls, skill_evolution, skills_with_levels)
                        total_call_count += s.get("callCount", 0)
                        total_evolution_events += skill_evolution.get(s["name"], {}).get("events", 0)
        elif isinstance(skills_list, list):
            for s in skills_list:
                _update_one_skill(s, skill_calls, skill_evolution, skills_with_levels)
                total_call_count += s.get("callCount", 0)
                total_evolution_events += skill_evolution.get(s["name"], {}).get("events", 0)

    # ── 计算角色总等级 ──
    depth_score = compute_skill_depth_score(skills_with_levels)
    quality_score = compute_quality_score(total_evolution_events, skill_updates, reflection_cycles)
    experience_score, exp_detail = compute_experience_score(total_call_count, run_days, community_score)
    total_level = compute_total_level(understanding_score, depth_score, quality_score, experience_score)
    tier = get_tier(total_level)

    # ── 更新 character ──
    data["character"]["level"] = total_level
    data["character"]["levelTitle"] = tier["name"]
    data["character"]["tier"] = tier
    data["character"]["allTiers"] = TIERS

    data["character"]["totalExp"] = round(understanding_score + depth_score + quality_score + experience_score, 1)
    data["character"]["expProgress"] = round((understanding_score + depth_score + quality_score + experience_score) / 100 * 100, 1)
    data["character"]["currentThreshold"] = total_level
    data["character"]["nextThreshold"] = total_level + 1

    # stats：五维映射
    data["character"]["stats"] = {
        "understanding": round(understanding_score / 30 * 100, 1),
        "skillDepth": round(depth_score / 25 * 100, 1),
        "quality": round(quality_score / 20 * 100, 1),
        "experience": round(experience_score / 25 * 100, 1),
        "execution": round(min(100, experience_score / 25 * 100 * 0.6 + depth_score / 25 * 100 * 0.4), 1),
        "thinkingDepth": round(min(100, quality_score / 20 * 100), 1),
        "knowledgeBreadth": round(min(100, community_score / 50 * 100 + experience_score / 25 * 20), 1),
    }

    # 五维元信息（用于首页展示）
    data["character"]["dimensionsMeta"] = [
        {"key": "understanding",  "icon": "🤝", "name": "懂你程度", "shortName": "懂你", "color": "#00d4ff", "desc": "越来越不用纠正"},
        {"key": "skillDepth",     "icon": "⚡", "name": "技能深度", "shortName": "技能", "color": "#fbbf24", "desc": "技能越来越厉害"},
        {"key": "quality",        "icon": "💎", "name": "沉淀质量", "shortName": "沉淀", "color": "#a78bfa", "desc": "越用越有沉淀"},
        {"key": "experience",     "icon": "🎯", "name": "使用经验", "shortName": "经验", "color": "#4ade80", "desc": "时间和广度积累"},
        {"key": "thinkingDepth",  "icon": "💭", "name": "思考深度", "shortName": "思考", "color": "#f472b6", "desc": "分析越来越深刻"},
    ]

    # debug 详情
    data["character"]["debug"] = {
        "metrics": {
            "understandingScore": understanding_score,
            "depthScore": depth_score,
            "qualityScore": quality_score,
            "experienceScore": experience_score,
        },
        "understandingDetail": understanding_detail,
        "depthDetail": {
            "totalSkillWeighted": sum(l * LAYER_WEIGHTS[layer] for l, layer in skills_with_levels),
            "maxPossible": sum(5 * LAYER_WEIGHTS[layer] * DEFAULT_SLOTS[layer] for layer in DEFAULT_SLOTS),
            "skillCount": len(skills_with_levels),
        },
        "qualityDetail": {
            "evolutionEvents": total_evolution_events,
            "skillUpdates": skill_updates,
            "reflectionCycles": reflection_cycles,
            "accumulatedPoints": total_evolution_events * 2 + skill_updates * 3 + reflection_cycles * 1,
        },
        "experienceDetail": exp_detail,
        "activeSkills": len(skills_with_levels),
        "runDays": run_days,
        "totalCallCount": total_call_count,
        "communityScore": community_score,
    }

    # ── 写回 ──
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # ── 输出报告 ──
    print(f"等级体系 v3.0 计算完成")
    print(f"  UNDERSTANDING: {understanding_score}/30  (灵魂{understanding_detail['soulDepth']}+记忆{understanding_detail['memoryDepth']}+习惯{understanding_detail['habitDepth']})")
    print(f"  SKILL_DEPTH:   {depth_score}/25")
    print(f"  QUALITY:       {quality_score}/20")
    print(f"  EXPERIENCE:    {experience_score}/25")
    print(f"  ─────────────────────────")
    print(f"  总等级:  Lv.{total_level} {tier['icon']} {tier['name']}")
    print(f"  运行天数: {run_days}  总调用: {total_call_count}")
    print(f"  沉淀事件: {total_evolution_events}  Skill更新: {skill_updates}  修炼: {reflection_cycles}")

def _update_one_skill(skill_dict, skill_calls, skill_evolution, skills_with_levels):
    name = skill_dict["name"]
    layer = determine_skill_layer(name, skill_dict)

    call_data = skill_calls.get(name, {})
    call_count = call_data.get("calls", skill_dict.get("callCount", 0))
    successes = call_data.get("successes", 0)
    failures = call_data.get("failures", 0)
    total_attempts = successes + failures
    success_rate = round(successes / max(total_attempts, 1) * 100) if total_attempts > 0 else skill_dict.get("successRate", 70)

    evo_data = skill_evolution.get(name, {})
    evolution_events = evo_data.get("events", 0)
    evolution_cycles = evo_data.get("cycles", 0)

    new_level = compute_skill_level(call_count, success_rate, evolution_events, evolution_cycles)
    new_exp = compute_skill_exp(new_level, call_count, success_rate)

    old_level = skill_dict.get("level", 1)
    if new_level > old_level:
        skill_dict["level"] = new_level
        skill_dict["exp"] = new_exp
    elif new_level == old_level:
        if new_exp > skill_dict.get("exp", 0):
            skill_dict["exp"] = new_exp

    skill_dict["callCount"] = call_count
    skill_dict["successRate"] = success_rate
    skill_dict["frequency"] = call_count_to_frequency(call_count)
    skill_dict["lastUpdated"] = datetime.now().strftime("%Y-%m-%d")
    skill_dict["levelName"] = SKILL_LEVEL_NAMES.get(skill_dict["level"], "萌芽")
    skill_dict["levelIcon"] = SKILL_LEVEL_ICONS.get(skill_dict["level"], "🌱")

    skills_with_levels.append((skill_dict["level"], layer))

if __name__ == "__main__":
    update_character_data()
    # 自动更新趋势数据 + 首页可视化数据
    import subprocess
    scripts_dir = str(Path(__file__).parent)
    for script in ["update-trend.py", "update-homepage-data.py"]:
        try:
            subprocess.run(["uv", "run", os.path.join(scripts_dir, script)], timeout=30)
        except Exception as e:
            print(f"{script} 更新失败: {e}")