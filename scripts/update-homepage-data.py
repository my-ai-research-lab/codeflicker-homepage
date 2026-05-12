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

WORKSPACE = _find_workspace()
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

    # 知识库分类描述映射（key = 目录相对路径）
    KNOWLEDGE_META = {
        "root": {"displayName": "根目录", "icon": "🏠", "description": "知识库顶层文档与索引"},
        "books": {"displayName": "读书笔记", "icon": "📖", "description": "书籍阅读笔记与核心观点提炼"},
        "notes": {"displayName": "学习笔记", "icon": "📝", "description": "日常学习笔记与技术积累"},
        "shared": {"displayName": "共享知识", "icon": "🔗", "description": "跨项目共享的知识与模式"},
        "guides": {"displayName": "指南手册", "icon": "📋", "description": "操作指南与最佳实践手册"},
        "templates": {"displayName": "模板库", "icon": "🧩", "description": "可复用的文档模板与框架"},
        "research": {"displayName": "调研报告", "icon": "🔬", "description": "深度调研报告与行业洞察"},
        "shared/people": {"displayName": "人物画像", "icon": "👤", "description": "关键人物信息与关系图谱"},
        "packages/investment": {"displayName": "投资理财", "icon": "💰", "description": "投资理财知识与策略记录"},
        "packages/rd-efficiency": {"displayName": "研发效能", "icon": "⚡", "description": "研发效能方法论与实践洞察"},
        "packages/ai-insight": {"displayName": "AI洞察", "icon": "🧠", "description": "AI行业动态与深度分析"},
        "packages/ai-insight/01-models": {"displayName": "大模型", "icon": "🤖", "description": "大语言模型技术演进与评测"},
        "packages/ai-insight/02-agents": {"displayName": "AI Agent", "icon": "🦾", "description": "Agent架构、自主性与工具链"},
        "packages/ai-insight/03-ai-companies": {"displayName": "AI公司", "icon": "🏢", "description": "AI公司动态与竞争格局"},
        "packages/ai-insight/04-enterprise-ai": {"displayName": "企业AI", "icon": "🏭", "description": "企业AI转型与落地实践"},
        "packages/ai-insight/best-practices": {"displayName": "最佳实践", "icon": "🏆", "description": "AI应用最佳实践与案例"},
        "packages/ai-insight/insights": {"displayName": "洞察提炼", "icon": "💡", "description": "从动态中提炼的结构性洞察"},
        "packages/ai-insight/insights/weekly": {"displayName": "周洞察", "icon": "📅", "description": "每周AI行业洞察汇总"},
        "packages/ai-insight/entity-profiles/companies": {"displayName": "公司画像", "icon": "🏢", "description": "AI公司详细档案与追踪"},
        "packages/ai-insight/entity-profiles/people": {"displayName": "行业人物", "icon": "👤", "description": "AI领域关键人物档案"},
        "packages/ai-insight/concepts/applications": {"displayName": "AI应用", "icon": "📱", "description": "AI应用场景与产品形态"},
        "packages/ai-insight/concepts/safety": {"displayName": "AI安全", "icon": "🛡️", "description": "AI安全与对齐研究"},
        "packages/ai-insight/concepts/coding": {"displayName": "AI Coding", "icon": "⌨️", "description": "AI辅助编程与开发范式"},
        "packages/ai-insight/concepts/agents": {"displayName": "Agent架构", "icon": "🦾", "description": "Agent技术架构与自主性"},
        "packages/ai-insight/concepts/infrastructure": {"displayName": "AI基础设施", "icon": "🏗️", "description": "训练/推理/部署基础设施"},
        "packages/ai-insight/concepts/enterprise": {"displayName": "企业转型", "icon": "🔄", "description": "企业AI转型路径与策略"},
        "packages/ai-insight/concepts/models": {"displayName": "模型技术", "icon": "🧪", "description": "模型架构与训练技术"},
        "templates/evo-skills-v2": {"displayName": "技能模板v2", "icon": "🧩", "description": "自进化技能模板与规范"},
        "packages/ai-insight/concepts/agents/ai-product-ultimate-form": {"displayName": "AI产品终极形态", "icon": "🎯", "description": "AI产品的终极形态探索与思考"},
    }

    if knowledge_dir.exists():
        for f in knowledge_dir.rglob("*.md"):
            total_files += 1
            size = os.path.getsize(f) / 1024
            total_size_kb += size
            parent = f.parent.relative_to(knowledge_dir)
            cat_name = str(parent) if str(parent) != "." else "root"
            if cat_name not in categories:
                meta = KNOWLEDGE_META.get(cat_name, {})
                categories[cat_name] = {
                    "name": cat_name,
                    "displayName": meta.get("displayName", cat_name),
                    "icon": meta.get("icon", "📁"),
                    "description": meta.get("description", f"{cat_name}相关文档"),
                    "fileCount": 0,
                    "sizeKB": 0
                }
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
    
    # 1. 首页项目（动态检测 my-homepage 或 link-homepage）
    # 从 character-data.json 读取首页URL（如果有的话）
    homepage_url = ""
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            cdata = json.load(f)
        homepage_url = cdata.get("character", {}).get("homepage", "") or cdata.get("character", {}).get("url", "")
    
    homepage_dirs = [WORKSPACE / "my-homepage", WORKSPACE / "link-homepage"]
    homepage_id = None
    actual_homepage_dir = None
    for hdir in homepage_dirs:
        if hdir.exists():
            homepage_id = hdir.name
            actual_homepage_dir = hdir
            break
    
    if homepage_id and homepage_id not in known_projects:
        # 从 character-data.json 读取用户名来动态命名
        owner_name = cdata.get("character", {}).get("name", "AI伙伴") if DATA_FILE.exists() else "AI伙伴"
        # 去掉"的AI伙伴"后缀，只保留用户名
        owner_name = owner_name.replace("的AI伙伴", "").replace("的ai伙伴", "")
        known_projects[homepage_id] = {
            "id": homepage_id,
            "name": f"{owner_name}进化首页",
            "icon": "🏠",
            "status": "deployed",
            "category": "homepage",
            "completedAt": date.today().strftime("%Y-%m-%d"),
            "url": homepage_url,
            "quality": {"level": "featured"},
            "subtitle": "自进化体系可视化仪表盘",
            "goal": "让体系状态可观测、成长可追踪",
            "deliverables": ["首页HTML", "character-data.json", "4维数据可视化"],
            "highlights": ["四维等级体系", "30天成长趋势", "技能拓扑图"],
            "techStack": ["HTML/CSS/JS", "Chart.js", "frontend-cloud"],
            "usedSkills": ["formless-power", "website-builder"]
        }

    # 2. 技能项目（动态扫描 user-skills/ 下的 SKILL.md，自动提取项目信息）
    skills_dir = WORKSPACE / "user-skills"
    
    if skills_dir.exists():
        for skill_dir in skills_dir.glob("*/"):
            skill_id = skill_dir.name
            skill_file = skill_dir / "SKILL.md"
            if not skill_file.exists():
                continue
            if skill_id in known_projects:
                continue
            
            # 从 SKILL.md 动态提取 name 和 description
            skill_name = skill_id
            skill_desc = ""
            skill_icon = "📦"
            skill_category = "tools"
            
            try:
                with open(skill_file, "r", encoding="utf-8") as f:
                    content = f.read(2000)  # 只读前2000字符
                
                # 提取 name
                name_match = re.search(r'^name:\s*(.+)', content, re.MULTILINE)
                if name_match:
                    skill_name = name_match.group(1).strip()
                
                # 提取 description（取第一句）
                desc_match = re.search(r'^description:\s*(.+)', content, re.MULTILINE)
                if desc_match:
                    full_desc = desc_match.group(1).strip()
                    # 去掉引号和换行
                    full_desc = full_desc.replace('"', '').replace("'", '').strip()
                    # 取第一句（句号或逗号前的部分）
                    first_sentence = re.split(r'[。，,;；]', full_desc)[0].strip()
                    skill_desc = first_sentence if first_sentence else full_desc[:60]
                
                # 根据skill_id推断分类和图标
                category_icon_map = {
                    "formless-power": ("homepage", "🧬"),
                    "sl-meta-persona-agent": ("research", "🎭"),
                    "sl-meta-product-thinking": ("research", "🧠"),
                    "sl-meta-signal-extractor": ("research", "👁️"),
                    "sl-meta-expression-design": ("research", "📝"),
                    "sl-meta-analogy-transfer": ("research", "🔄"),
                    "sl-meta-boundary-sense": ("tools", "🛡️"),
                    "sl-meta-context-sense": ("tools", "👁️"),
                    "sl-meta-debug-pro": ("tools", "🔧"),
                    "sl-meta-trust-builder": ("tools", "🤝"),
                    "sl-meta-uncertainty-marker": ("tools", "🎯"),
                    "sl-executive-report-writing": ("docs", "📄"),
                    "sl-kim-doc-writer": ("docs", "📄"),
                    "sl-zelda-ui": ("docs", "🎨"),
                }
                if skill_id in category_icon_map:
                    skill_category, skill_icon = category_icon_map[skill_id]
                elif "meta-" in skill_id or "evo-" in skill_id:
                    skill_category = "research"
                    skill_icon = "🧠"
                elif skill_id.startswith("sl-"):
                    skill_category = "tools"
            except Exception:
                pass
            
            known_projects[skill_id] = {
                "id": skill_id,
                "name": skill_name,
                "icon": skill_icon,
                "status": "deployed",
                "category": skill_category,
                "completedAt": date.today().strftime("%Y-%m-%d"),
                "quality": {"level": "standard"},
                "subtitle": skill_desc,
                "url": "",
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

    # 9. 自动从 personas/ 目录读取分身数据
    personas = []
    personas_dir = WORKSPACE / "personas"
    if personas_dir.exists():
        # 预设顺序和分身颜色/图标
        PERSONA_ORDER = ["liangge", "liangning", "titi", "shenlang"]
        preset = {
            "liangge":   {"color": "#fbbf24", "icon": "💡"},
            "liangning": {"color": "#f472b6", "icon": "🌸"},
            "titi":      {"color": "#4ade80", "icon": "📊"},
            "shenlang":  {"color": "#00d4ff", "icon": "⚔️"},
        }
        all_dirs = sorted(personas_dir.iterdir(), key=lambda d: (
            PERSONA_ORDER.index(d.name) if d.name in PERSONA_ORDER else 999
        ))
        for persona_dir in all_dirs:
            if not persona_dir.is_dir() or persona_dir.name.startswith("_"):
                continue
            soul_file = persona_dir / "SOUL.md"
            readme_file = persona_dir / "README.md"
            if not soul_file.exists():
                continue
            soul_content = soul_file.read_text(encoding="utf-8")
            readme_content = readme_file.read_text(encoding="utf-8") if readme_file.exists() else ""

            # 从 SOUL.md frontmatter 提取 name / description
            name_match = re.search(r'^name:\s*(.+)$', soul_content, re.MULTILINE)
            skill_name = name_match.group(1).strip() if name_match else persona_dir.name

            # 第一个 ## 标题作为 fullName
            fullname_match = re.search(r'^# (.+)$', soul_content, re.MULTILINE)
            full_name = fullname_match.group(1).strip() if fullname_match else skill_name

            # 角色
            role_match = re.search(r'\*\*角色\*\*[：:]\s*(.+)', soul_content)
            role = role_match.group(1).strip() if role_match else ""

            # 定位
            position_match = re.search(r'\*\*定位\*\*[：:]\s*(.+)', soul_content)
            description = position_match.group(1).strip() if position_match else ""

            # 核心使命
            mission_match = re.search(r'\*\*核心使命\*\*[：:]\s*(.+)', soul_content)
            mission = mission_match.group(1).strip() if mission_match else ""

            # skills 目录下的子技能名
            skills_dir = persona_dir / "skills"
            skill_list = []
            if skills_dir.exists():
                for sk in skills_dir.iterdir():
                    if sk.is_dir() and not sk.name.startswith("_") and sk.name != "experience-refinery":
                        sk_md = sk / "SKILL.md"
                        if sk_md.exists():
                            sk_content = sk_md.read_text(encoding="utf-8")
                            dn_match = re.search(r'^description:\s*"?(.{4,50})', sk_content, re.MULTILINE)
                            skill_list.append(dn_match.group(1).strip('"\n').split('—')[0].strip()[:20] if dn_match else sk.name)

            # 触发词（从 README 里提取代码块内容）
            trigger_words = []
            trigger_block = re.search(r'```\n(.+?)\n```', readme_content, re.DOTALL)
            if trigger_block:
                trigger_words = [t.strip().rstrip('...').strip() for t in trigger_block.group(1).strip().splitlines() if t.strip()][:4]

            p = preset.get(persona_dir.name, {"color": "#a78bfa", "icon": "🤖"})
            personas.append({
                "name": persona_dir.name,
                "fullName": full_name,
                "icon": p["icon"],
                "role": role,
                "color": p["color"],
                "description": description,
                "mission": mission,
                "thinkingStyle": "",
                "tone": "",
                "skills": skill_list[:6],
                "triggerWords": trigger_words,
                "tag": "Self"
            })

    data["personas"] = personas

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
    print(f"  分身: {len(personas)} 个 ({', '.join(p['name'] for p in personas) or '无'})")

    if new_milestones > 0 or newly_unlocked:
        print(f"\n🎉 本次更新有变化！")
        if newly_unlocked:
            print(f"  成就解锁: {', '.join(newly_unlocked)}")
        if new_milestones > 0:
            print(f"  新里程碑: {new_milestones} 个")


if __name__ == "__main__":
    update_homepage_data()