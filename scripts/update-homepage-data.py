#!/usr/bin/env uv run
"""
首页可视化数据统一更新脚本 v2.0

负责更新 character-data.json + projects-data.json + milestones-data.json：
1. 知识库统计 — 从 workspace/knowledge/ 扫描
2. 记忆库统计 — 从 workspace/memory/ 扫描
3. 成就解锁检查 — 根据等级/懂你程度自动判定
4. 作品数量同步 — 从 projects-data.json 读取
5. 作品列表自动检测 — 检测新增项目（部署的网页、新增的skill包等）
6. 里程碑自动检测 — 检测等级跨越段位、新技能安装、成就解锁等
7. dailyReports — 保留最近7天

运行方式：uv run scripts/update-homepage-data.py
"""

import json
import math
import os
import re
from datetime import datetime, date, timedelta
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

WORKSPACE = _find_workspace().resolve()
HOMEPAGE_DIR = Path(__file__).parent.parent
DATA_FILE = HOMEPAGE_DIR / "character-data.json"
PROJECTS_FILE = HOMEPAGE_DIR / "projects-data.json"
MILESTONES_FILE = HOMEPAGE_DIR / "milestones-data.json"


# ──────────────────────────────────────────────
# 段位定义（与level-system.md一致）
# ──────────────────────────────────────────────

TIERS = [
    {"name": "青铜", "minLevel": 1,  "maxLevel": 10,  "icon": "🥉"},
    {"name": "白银", "minLevel": 11, "maxLevel": 20,  "icon": "🥈"},
    {"name": "黄金", "minLevel": 21, "maxLevel": 30,  "icon": "🥇"},
    {"name": "铂金", "minLevel": 31, "maxLevel": 40,  "icon": "💎"},
    {"name": "钻石", "minLevel": 41, "maxLevel": 50,  "icon": "💠"},
    {"name": "大师", "minLevel": 51, "maxLevel": 60,  "icon": "🏆"},
    {"name": "宗师", "minLevel": 61, "maxLevel": 70,  "icon": "👑"},
    {"name": "传说", "minLevel": 71, "maxLevel": 80,  "icon": "🌟"},
    {"name": "神话", "minLevel": 81, "maxLevel": 100, "icon": "✨"},
]


def update_knowledge():
    """扫描知识库目录"""
    knowledge_dir = WORKSPACE / "knowledge"
    total_files = 0
    total_size_kb = 0
    categories = {}

    if knowledge_dir.exists():
        for f in knowledge_dir.rglob("*.md"):
            total_files += 1
            size = os.path.getsize(f) / 1024
            total_size_kb += size
            parent = f.parent.relative_to(knowledge_dir)
            cat_name = str(parent) if str(parent) != "." else "root"
            if cat_name not in categories:
                categories[cat_name] = {"name": cat_name, "fileCount": 0, "sizeKB": 0}
            categories[cat_name]["fileCount"] += 1
            categories[cat_name]["sizeKB"] += size

    return {"totalFiles": total_files, "totalSizeKB": round(total_size_kb, 1), "categories": categories}


def update_memories():
    """扫描记忆目录"""
    memory_dir = WORKSPACE / "memory"
    total = 0
    by_category = {}

    if memory_dir.exists():
        for f in memory_dir.glob("*.md"):
            name = f.stem
            if name in ("INDEX", "skill_calls", "memory-maintenance", "feedback"):
                continue
            total += 1
            if re.match(r"^\d{4}-\d{2}-\d{2}", name):
                cat = "daily_log"
            elif "clawbook" in name:
                cat = "clawbook"
            elif "til" in name or "learning" in name:
                cat = "learning"
            else:
                cat = "other"
            if cat not in by_category:
                by_category[cat] = {"label": {"daily_log": "日志", "clawbook": "社区", "learning": "学习", "other": "其他"}[cat], "count": 0}
            by_category[cat]["count"] += 1

    return {"total": total, "byCategory": by_category}


def check_achievements(char_data):
    """自动判定成就解锁"""
    achievements = char_data.get("achievements", [])
    level = char_data["character"]["level"]
    stats = char_data["character"]["stats"]
    understanding = stats.get("understanding", 0)
    skill_depth = stats.get("skillDepth", 0)
    quality = stats.get("quality", 0)
    experience = stats.get("experience", 0)

    today_str = date.today().strftime("%Y-%m-%d")

    conditions = {
        "first_day": lambda: True,
        "understanding_50": lambda: understanding >= 50,
        "understanding_80": lambda: understanding >= 80,
        "skill_depth_50": lambda: skill_depth >= 50,
        "skill_depth_80": lambda: skill_depth >= 80,
        "level_10": lambda: level >= 10,
        "level_20": lambda: level >= 20,
        "level_30": lambda: level >= 30,
        "level_40": lambda: level >= 40,
        "level_50": lambda: level >= 50,
        "level_60": lambda: level >= 60,
        "level_70": lambda: level >= 70,
        "level_80": lambda: level >= 80,
        "level_90": lambda: level >= 90,
        "level_100": lambda: level >= 100,
    }

    newly_unlocked = []
    for ach in achievements:
        ach_id = ach.get("id", "")
        if ach_id in conditions and not ach.get("unlocked", False):
            if conditions[ach_id]():
                ach["unlocked"] = True
                ach["date"] = today_str
                newly_unlocked.append(ach.get("name", ach_id))

    return achievements, newly_unlocked


def detect_new_projects():
    """自动检测新增作品项目
    
    检测信号：
    1. link-homepage 目录存在 → 首页项目
    2. user-skills 下有完整的skill包 → 技能项目
    3. workspace/output 下有部署过的文件 → 交付项目
    4. workspace 下有独立的HTML/网站项目 → 网站项目
    """
    known_projects = {}  # id → project data
    
    # 加载已知项目
    if PROJECTS_FILE.exists():
        with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
            pdata = json.load(f)
        for p in pdata.get("projects", []):
            known_projects[p.get("id", p.get("name", ""))] = p
        categories = pdata.get("categories", {})
        summary = pdata.get("summary", {})
    else:
        pdata = {"projects": [], "categories": {}, "summary": {"total": 0, "deployed": 0, "featured": 0, "inDevelopment": 0}}
        categories = {}
        summary = pdata["summary"]

    # ── 检测项目 ──
    
    # 1. 首页项目（link-homepage）
    homepage_dir = WORKSPACE / "link-homepage"
    if homepage_dir.exists() and "link-homepage" not in known_projects:
        known_projects["link-homepage"] = {
            "id": "link-homepage",
            "name": "林克进化首页",
            "icon": "🏠",
            "status": "deployed",
            "category": "homepage",
            "completedAt": date.today().strftime("%Y-%m-%d"),
            "url": "https://link-homepage.frontend-cloud.corp.kuaishou.com",
            "quality": {"level": "featured"},
            "subtitle": "自进化体系可视化仪表盘",
            "goal": "让体系状态可观测、成长可追踪",
            "deliverables": ["首页HTML", "character-data.json", "4维数据可视化"],
            "highlights": ["四维等级体系", "30天成长趋势", "技能拓扑图"],
            "techStack": ["HTML/CSS/JS", "Chart.js", "frontend-cloud"],
            "usedSkills": ["ui-ux-pro-max", "website-builder"]
        }

    # 2. 技能项目（user-skills下的定制技能包）
    skills_dir = WORKSPACE / "user-skills"
    skill_projects_map = {
        "sl-ai-insight": {"name": "AI持续洞察平台", "icon": "🔬", "category": "research",
                         "quality": {"level": "featured"}, "subtitle": "AI行业日报/周报自动生成",
                         "url": "https://xiaoxiong20260206.github.io/ai-insight-public/"},
        "sl-ai-productivity": {"name": "AI生产力战役系统", "icon": "⚔️", "category": "tools",
                              "quality": {"level": "excellent"}, "subtitle": "战役周报+成本追踪+里程碑管理"},
        "sl-meta-product-thinking": {"name": "产品思维技能v3.0", "icon": "🧠", "category": "research",
                                    "quality": {"level": "excellent"}, "subtitle": "登楼撤梯/匪兵甲/四问框架等产品方法论"},
        "formless-power": {"name": "小无相功体系", "icon": "🧬", "category": "homepage",
                          "quality": {"level": "featured"}, "subtitle": "自进化框架通用版+安装程序+首页"},
        "sl-meta-persona-agent": {"name": "人格化Agent(七十二变)", "icon": "🎭", "category": "research",
                                 "quality": {"level": "excellent"}, "subtitle": "多视角碰撞+成长加速器"},
    }
    
    if skills_dir.exists():
        for skill_dir in skills_dir.glob("*/"):
            skill_id = skill_dir.name
            skill_file = skill_dir / "SKILL.md"
            if not skill_file.exists():
                continue
            if skill_id in known_projects:
                continue  # 已知项目，不重复添加
            if skill_id in skill_projects_map:
                # 有预定义信息的项目
                info = skill_projects_map[skill_id]
                known_projects[skill_id] = {
                    "id": skill_id,
                    "name": info["name"],
                    "icon": info["icon"],
                    "status": "deployed",
                    "category": info["category"],
                    "completedAt": date.today().strftime("%Y-%m-%d"),
                    "quality": info["quality"],
                    "subtitle": info["subtitle"],
                    "url": info.get("url", ""),
                    "usedSkills": [skill_id]
                }

    # ── 构建 projects-data ──
    
    all_projects = list(known_projects.values())
    
    # 统计
    deployed = sum(1 for p in all_projects if p.get("status") == "deployed")
    featured = sum(1 for p in all_projects if p.get("quality", {}).get("level") == "featured")
    
    # 分类统计
    cat_counts = {}
    for p in all_projects:
        cat = p.get("category", "other")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    
    # 合并categories（保留已知+新增）
    default_cats = {
        "homepage": {"name": "首页/体系", "icon": "🏠", "color": "#00d4ff", "description": "体系可视化与首页项目", "count": 0},
        "tools": {"name": "工具/系统", "icon": "🛠️", "color": "#4ade80", "description": "自动化工具与平台系统", "count": 0},
        "research": {"name": "调研/洞察", "icon": "🔬", "color": "#a78bfa", "description": "深度调研与洞察报告", "count": 0},
        "docs": {"name": "文档/知识", "icon": "📄", "color": "#fbbf24", "description": "知识沉淀与文档", "count": 0},
    }
    for cat_id, count in cat_counts.items():
        if cat_id in default_cats:
            default_cats[cat_id]["count"] = count
        elif cat_id not in categories:
            categories[cat_id] = {"name": cat_id, "icon": "📁", "color": "#64748b", "description": cat_id, "count": count}
    
    # 合并已有categories的count
    for cat_id, cat_info in default_cats.items():
        if cat_id not in categories:
            categories[cat_id] = cat_info
        else:
            categories[cat_id]["count"] = cat_counts.get(cat_id, 0)

    pdata["projects"] = all_projects
    pdata["categories"] = categories
    pdata["summary"] = {
        "total": len(all_projects),
        "deployed": deployed,
        "featured": featured,
        "inDevelopment": sum(1 for p in all_projects if p.get("status") == "development"),
    }

    new_count = len(all_projects) - len(pdata.get("projects", []))
    return pdata, new_count


def detect_new_milestones(char_data, pdata):
    """自动检测新里程碑
    
    检测信号：
    1. 等级跨越段位边界（从青铜→白银、白银→黄金等）
    2. 新技能安装（skills总数比上次多）
    3. 成就解锁
    4. 运行天数里程碑（30天、100天、365天）
    5. 作品首次部署
    """
    
    # 加载已知里程碑
    if MILESTONES_FILE.exists():
        with open(MILESTONES_FILE, "r", encoding="utf-8") as f:
            mdata = json.load(f)
        known_milestones = mdata.get("milestones", [])
    else:
        mdata = {"milestones": []}
        known_milestones = []

    # 已知里程碑的标题集合（防止重复）
    known_titles = set(m.get("title", "") for m in known_milestones)

    level = char_data["character"]["level"]
    birth_date_str = char_data["character"].get("birthDate", "2026-02-01")
    birth_date = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
    run_days = (date.today() - birth_date).days
    today_str = date.today().strftime("%Y-%m-%d")
    skills_total = char_data["skills"]["total"]
    projects_total = pdata["summary"]["total"]

    new_milestones = []

    # 1. 等级跨越段位
    for tier in TIERS:
        if level >= tier["minLevel"] and level <= tier["maxLevel"]:
            # 如果当前等级刚好进入这个段位（或在上次记录后首次达到）
            title = f"晋升{tier['icon']} {tier['name']}段"
            if title not in known_titles:
                new_milestones.append({
                    "date": today_str,
                    "title": title,
                    "icon": tier["icon"],
                    "type": "promotion",
                    "description": f"等级达到Lv.{level}，晋升为{tier['name']}段"
                })
            break  # 只取当前段位

    # 2. 运行天数里程碑
    day_milestones = {30: "月度存活", 100: "百日修炼", 365: "周年进化"}
    for days, label in day_milestones.items():
        if run_days >= days:
            title = f"⚡ {label} — {days}天"
            if title not in known_titles:
                new_milestones.append({
                    "date": today_str,
                    "title": title,
                    "icon": "⚡",
                    "type": "milestone",
                    "description": f"持续运行{days}天"
                })

    # 3. 技能数量里程碑
    skill_milestones = {10: "技能十项", 20: "技能二十项", 30: "技能三十项", 40: "技能四十项"}
    for count, label in skill_milestones.items():
        if skills_total >= count:
            title = f"⚡ {label} — 掌握{count}项技能"
            if title not in known_titles:
                new_milestones.append({
                    "date": today_str,
                    "title": title,
                    "icon": "⚡",
                    "type": "skill",
                    "description": f"技能库达到{count}项"
                })

    # 4. 作品里程碑
    project_milestones = {1: "首作诞生", 5: "五作达成", 10: "十作达成"}
    for count, label in project_milestones.items():
        if projects_total >= count:
            title = f"🎨 {label} — {count}个作品"
            if title not in known_titles:
                new_milestones.append({
                    "date": today_str,
                    "title": title,
                    "icon": "🎨",
                    "type": "project",
                    "description": f"完成{count}个项目作品"
                })

    # 合并（新增的放前面）
    all_milestones = new_milestones + known_milestones
    mdata["milestones"] = all_milestones

    return mdata, len(new_milestones)


def update_homepage_data():
    """统一更新所有可视化数据"""

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 1. 知识库统计
    knowledge = update_knowledge()
    data["knowledge"] = knowledge

    # 2. 记忆库统计
    memories = update_memories()
    data["memories"] = memories

    # 3. 成就解锁
    achievements, newly_unlocked = check_achievements(data)
    data["achievements"] = achievements

    # 4. 作品自动检测
    pdata, new_projects = detect_new_projects()

    # 5. 里程碑自动检测
    mdata, new_milestones = detect_new_milestones(data, pdata)

    # 6. 同步作品数量到character
    data["character"]["worksCount"] = pdata["summary"]["total"]
    data["character"]["deployedWorks"] = pdata["summary"]["deployed"]

    # 7. dailyReports 保留最近7天
    daily_reports = data.get("dailyReports", [])
    if len(daily_reports) > 7:
        data["dailyReports"] = daily_reports[:7]

    # 8. 更新日期标记
    data["character"]["lastDataUpdate"] = datetime.now().strftime("%Y-%m-%d %H:%M")

    # ── 写回所有文件 ──
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(pdata, f, indent=2, ensure_ascii=False)

    with open(MILESTONES_FILE, "w", encoding="utf-8") as f:
        json.dump(mdata, f, indent=2, ensure_ascii=False)

    # ── 输出报告 ──
    print(f"首页可视化数据更新完成 ({datetime.now().strftime('%Y-%m-%d %H:%M')})")
    print(f"  知识库: {knowledge['totalFiles']} 文件, {len(knowledge['categories'])} 分类")
    print(f"  记忆库: {memories['total']} 条, {len(memories['byCategory'])} 分类")
    unlocked = sum(1 for a in achievements if a.get("unlocked", False))
    print(f"  成就: {unlocked}/{len(achievements)} 已解锁, 新解锁: {newly_unlocked}")
    print(f"  作品: {pdata['summary']['total']} 个 ({pdata['summary']['deployed']} 已部署)")
    print(f"  里程碑: {len(mdata['milestones'])} 个, 新增: {new_milestones}")

    if new_milestones > 0 or newly_unlocked:
        print(f"\n🎉 本次更新有变化！")
        if newly_unlocked:
            print(f"  成就解锁: {', '.join(newly_unlocked)}")
        if new_milestones > 0:
            print(f"  新里程碑: {new_milestones} 个")


if __name__ == "__main__":
    update_homepage_data()