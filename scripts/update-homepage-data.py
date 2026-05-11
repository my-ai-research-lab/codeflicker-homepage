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
    """扫描知识库目录 — v3.0 结构化三层知识库（中文展示）"""

    # ── 知识库三层定义 + 中文映射 ──
    LAYER_DEF = [
        {"tag": "L1-meta",   "label": "元座知识层", "desc": "支撑元能力的思想和方法论"},
        {"tag": "L2-domain", "label": "领域知识层", "desc": "特定领域的深度研究和知识沉淀"},
        {"tag": "L3-execution", "label": "实践知识层", "desc": "具体执行中产出的方案和文档"},
    ]

    # 一级目录 → (中文名, 图层归属, icon, 描述)
    TOP_DIR_MAP = {
        "books":       {"displayName": "书籍笔记",     "layerTag": "L1-meta",   "icon": "📖", "desc": "读书笔记与核心思想提炼"},
        "guides":      {"displayName": "实践指南",     "layerTag": "L3-execution", "icon": "🧭", "desc": "开发约束、习惯规范、操作指南"},
        "notes":       {"displayName": "经验笔记",     "layerTag": "L3-execution", "icon": "📝", "desc": "踩坑记录、任务流程、沟通经验"},
        "research":    {"displayName": "调研沉淀",     "layerTag": "L2-domain", "icon": "🔬", "desc": "进化日志、社区洞察等研究资料"},
        "shared":      {"displayName": "共享知识",     "layerTag": "L1-meta",   "icon": "🔗", "desc": "跨领域共享的方法与人物档案"},
        "templates":   {"displayName": "模板资源",     "layerTag": "L3-execution", "icon": "📦", "desc": "技能模板、包结构定义"},
        "packages":    {"displayName": "领域知识包",   "layerTag": "L2-domain", "icon": "📚", "desc": "按领域组织的深度知识体系"},
    }

    # packages 二级目录 → 中文映射
    PKG_DIR_MAP = {
        "ai-insight":         {"displayName": "AI行业洞察",     "icon": "🤖", "desc": "大模型/Agent/AI应用/企业AI的持续追踪与洞察"},
        "investment":         {"displayName": "投资理财",       "icon": "💰", "desc": "基金、持仓、定投等投资知识"},
        "rd-efficiency":      {"displayName": "研发效能",       "icon": "⚡", "desc": "研发效能领域的方法论与最佳实践"},
    }

    # ai-insight 三级目录 → 中文映射
    AIINSIGHT_DIR_MAP = {
        "01-models":          {"displayName": "大模型",         "icon": "🧠", "desc": "LLM架构、训练、推理、多模态等技术追踪"},
        "02-agents":          {"displayName": "AI Agent",      "icon": "🤖", "desc": "自主Agent架构、工具链、多Agent协作"},
        "03-ai-companies":    {"displayName": "AI公司",         "icon": "🏢", "desc": "OpenAI/Anthropic/Google等公司动态与战略"},
        "04-enterprise-ai":   {"displayName": "企业AI转型",    "icon": "🏭", "desc": "企业AI落地路径、组织变革、ROI实践"},
        "best-practices":    {"displayName": "最佳实践",       "icon": "✅", "desc": "AI Coding/AI产品等实操方法论"},
        "concepts":           {"displayName": "概念体系",       "icon": "💡", "desc": "AI领域的核心概念与框架梳理"},
        "entity-profiles":    {"displayName": "实体档案",       "icon": "📇", "desc": "AI领域关键人物与公司画像"},
        "insights":           {"displayName": "深度洞察",       "icon": "🔍", "desc": "趋势分析与阶段性深度调研"},
        "deep-research":      {"displayName": "专题调研",       "icon": "🔎", "desc": "针对特定主题的深度调研报告"},
        "tracking-registry":  {"displayName": "追踪注册表",    "icon": "📋", "desc": "AI领域动态追踪的注册与索引"},
    }

    # concepts 四级目录 → 中文映射
    CONCEPTS_DIR_MAP = {
        "models":              {"displayName": "模型原理",     "icon": "🧠"},
        "agents":              {"displayName": "Agent原理",   "icon": "🤖"},
        "applications":        {"displayName": "AI应用",      "icon": "📱"},
        "coding":              {"displayName": "AI编程",      "icon": "⌨️"},
        "enterprise":          {"displayName": "企业转型",    "icon": "🏭"},
        "infrastructure":      {"displayName": "基础设施",    "icon": "🏗️"},
        "safety":              {"displayName": "AI安全",      "icon": "🛡️"},
    }

    # entity-profiles 四级目录 → 中文映射
    ENTITY_DIR_MAP = {
        "companies":           {"displayName": "公司画像",     "icon": "🏢"},
        "people":              {"displayName": "人物画像",     "icon": "👤"},
    }

    # insights 四级目录
    INSIGHTS_DIR_MAP = {
        "weekly":              {"displayName": "周洞察",       "icon": "📊"},
    }

    # templates 四级目录
    TEMPLATES_DIR_MAP = {
        "evo-skills-v2":       {"displayName": "自进化技能模板v2", "icon": "🧬"},
    }

    # shared 四级目录
    SHARED_DIR_MAP = {
        "people":              {"displayName": "人物档案",     "icon": "👤"},
    }

    knowledge_dir = WORKSPACE / "knowledge"
    total_files = 0
    total_size_kb = 0
    # 扁平统计（保留给旧代码兼容）
    categories_flat = {}
    # 结构化树（三层架构）
    tree = {}

    # ── 辅助函数 ──
    def _meta_for_path(rel_path_str):
        """根据文件相对路径返回中文元数据"""
        parts = rel_path_str.split("/") if rel_path_str != "." else []

        if len(parts) == 0:
            return {"displayName": "根目录索引", "icon": "📋", "desc": "知识库总索引", "layerTag": "L1-meta"}
        if parts[0] == "packages" and len(parts) >= 2:
            pkg = parts[1]
            pkg_meta = PKG_DIR_MAP.get(pkg, {"displayName": pkg, "icon": "📁", "desc": ""})
            if len(parts) == 2:
                return {**pkg_meta, "layerTag": "L2-domain"}
            sub = parts[2]
            if pkg == "ai-insight":
                # ai-insight 的三级
                sub_meta = AIINSIGHT_DIR_MAP.get(sub, {"displayName": sub, "icon": "📁", "desc": ""})
                if len(parts) == 3:
                    return {**sub_meta, "layerTag": "L2-domain", "desc": sub_meta.get("desc", "")}
                # 四级: concepts/entity-profiles/insights 下
                level4 = parts[3]
                if sub == "concepts":
                    l4_meta = CONCEPTS_DIR_MAP.get(level4, {"displayName": level4, "icon": "📁"})
                    return {**l4_meta, "layerTag": "L2-domain", "desc": f"AI {l4_meta.get('displayName', level4)}领域的概念梳理"}
                elif sub == "entity-profiles":
                    l4_meta = ENTITY_DIR_MAP.get(level4, {"displayName": level4, "icon": "📁"})
                    return {**l4_meta, "layerTag": "L2-domain", "desc": f"AI领域{l4_meta.get('displayName', level4)}档案"}
                elif sub == "insights":
                    l4_meta = INSIGHTS_DIR_MAP.get(level4, {"displayName": level4, "icon": "📁"})
                    return {**l4_meta, "layerTag": "L2-domain", "desc": f"AI洞察{l4_meta.get('displayName', level4)}汇总"}
                elif sub == "agents" and level4 == "ai-product-ultimate-form":
                    return {"displayName": "AI产品终极形态", "icon": "🚀", "layerTag": "L2-domain", "desc": "AI产品的终极形态探讨"}
                else:
                    return {"displayName": level4, "icon": "📁", "layerTag": "L2-domain", "desc": ""}
            else:
                return {"displayName": sub, "icon": "📁", "layerTag": "L2-domain", "desc": ""}
        if parts[0] == "templates" and len(parts) >= 2:
            base_meta = TOP_DIR_MAP.get("templates", {})
            l2_meta = TEMPLATES_DIR_MAP.get(parts[1], {"displayName": parts[1], "icon": "📁"})
            return {**l2_meta, "layerTag": base_meta.get("layerTag", "L3-execution"), "desc": l2_meta.get("desc", "")}
        if parts[0] == "shared" and len(parts) >= 2:
            base_meta = TOP_DIR_MAP.get("shared", {})
            l2_meta = SHARED_DIR_MAP.get(parts[1], {"displayName": parts[1], "icon": "📁"})
            return {**l2_meta, "layerTag": base_meta.get("layerTag", "L1-meta"), "desc": l2_meta.get("desc", "")}
        # 一级目录
        top = parts[0]
        return TOP_DIR_MAP.get(top, {"displayName": top, "icon": "📁", "desc": "", "layerTag": "L3-execution"})

    # ── 第一遍：扫描所有文件，构建扁平统计 ──
    if knowledge_dir.exists():
        for f in knowledge_dir.rglob("*.md"):
            total_files += 1
            size = os.path.getsize(f) / 1024
            total_size_kb += size
            rel = f.parent.relative_to(knowledge_dir)
            cat_key = str(rel) if str(rel) != "." else "root"
            if cat_key not in categories_flat:
                meta = _meta_for_path(cat_key)
                categories_flat[cat_key] = {
                    "name": cat_key,
                    "displayName": meta.get("displayName", cat_key),
                    "icon": meta.get("icon", "📁"),
                    "description": meta.get("desc", ""),
                    "layerTag": meta.get("layerTag", "L3-execution"),
                    "fileCount": 0,
                    "sizeKB": 0,
                    "relatedSkills": [],
                    "relatedMemories": [],
                    "heatLevel": 1,
                }
            categories_flat[cat_key]["fileCount"] += 1
            categories_flat[cat_key]["sizeKB"] += size

    # ── 第二遍：构建三层树结构 ──
    # 聚合策略 v4.0（沈浪要求：领域知识包拆分为独立卡片）：
    # - 一级目录（books/guides/notes 等）→ 一个卡片
    # - packages 下的每个子包 → 独立卡片（不再合并成"领域知识包"）
    # - ai-insight 下的每个二级目录 → 独立卡片
    # - 四级目录文件合并回对应三级卡片（concepts→概念体系、entity-profiles→实体档案）

    # Step 1: 合并四级目录文件数到对应三级
    # 四级目录: packages/ai-insight/concepts/* → 合并到 concepts
    #           packages/ai-insight/entity-profiles/* → 合并到 entity-profiles
    #           packages/ai-insight/insights/weekly → 合并到 insights
    #           packages/ai-insight/concepts/agents/ai-product-ultimate-form → 合并到 concepts/agents
    merged_flat = {}
    for cat_key, cat_data in categories_flat.items():
        parts = cat_key.split("/")
        # 四级目录 → 合并回三级
        if len(parts) >= 4 and parts[0] == "packages" and parts[1] == "ai-insight":
            parent_key = "packages/ai-insight/" + parts[2]
            if parts[2] in ("concepts", "entity-profiles", "insights"):
                # 合并到二级父目录的 key（如 concepts→概念体系）
                # 但我们想让 concepts/* 和 entity-profiles/* 合并回 concepts/entity-profiles 三级卡片
                # 而不是拆成一个个四级卡片
                if parent_key not in merged_flat:
                    merged_flat[parent_key] = dict(categories_flat.get(parent_key, cat_data))
                    merged_flat[parent_key]["fileCount"] = 0
                    merged_flat[parent_key]["sizeKB"] = 0
                merged_flat[parent_key]["fileCount"] += cat_data["fileCount"]
                merged_flat[parent_key]["sizeKB"] += cat_data.get("sizeKB", 0)
                continue
        # 三级目录（如果被四级合并覆盖，后面会重新赋值）
        if cat_key not in merged_flat:
            merged_flat[cat_key] = dict(cat_data)

    # 确保 concepts/entity-profiles/insights 三级卡片包含自身+所有四级文件
    for special_key in ["packages/ai-insight/concepts", "packages/ai-insight/entity-profiles", "packages/ai-insight/insights"]:
        if special_key in categories_flat and special_key in merged_flat:
            # 如果三级本身也有文件，加上
            base = categories_flat[special_key]
            if base["fileCount"] > 0 and merged_flat[special_key]["fileCount"] == 0:
                merged_flat[special_key] = dict(base)

    # Step 2: 构建卡片列表
    cards = []

    # 非packages的一级目录 → 按一级目录聚合
    non_pkg_cats = {}
    for cat_key, cat_data in merged_flat.items():
        parts = cat_key.split("/")
        if parts[0] == "packages" or parts[0] == "root":
            continue
        top = parts[0]
        if top not in non_pkg_cats:
            top_meta = _meta_for_path(top)
            non_pkg_cats[top] = {
                "displayName": top_meta.get("displayName", top),
                "icon": top_meta.get("icon", "📁"),
                "layerTag": top_meta.get("layerTag", "L3-execution"),
                "description": top_meta.get("desc", ""),
                "totalFiles": 0,
                "subCategories": [],
            }
        non_pkg_cats[top]["totalFiles"] += cat_data["fileCount"]
        if cat_key != top:
            non_pkg_cats[top]["subCategories"].append({
                "displayName": cat_data.get("displayName", cat_key),
                "icon": cat_data.get("icon", "📁"),
                "fileCount": cat_data["fileCount"],
            })

    for top_name, top_data in non_pkg_cats.items():
        sub_cats = top_data.get("subCategories", [])
        sub_summary = ""
        if sub_cats:
            top3 = sub_cats[:3]
            names = [sc["displayName"] for sc in top3]
            more = f"等{len(sub_cats)}个子领域" if len(sub_cats) > 3 else ""
            sub_summary = f"（含 {', '.join(names)}{more}）"
        cards.append({
            "displayName": top_data["displayName"],
            "icon": top_data["icon"],
            "count": top_data["totalFiles"],
            "layerTag": top_data["layerTag"],
            "description": top_data["description"] + sub_summary,
            "heatLevel": min(5, max(1, (top_data["totalFiles"] // 10) + 1)),
        })

    # root → 小卡片（归入元座知识层——知识库总索引是元认知性质的）
    root_data = merged_flat.get("root")
    if root_data:
        cards.append({
            "displayName": "知识库总索引",
            "icon": "📋",
            "count": root_data["fileCount"],
            "layerTag": "L1-meta",  # 强制归入元座知识层
            "description": "知识库总索引与导航文件",
            "heatLevel": 1,
        })

    # packages 子包 → 独立卡片
    for cat_key, cat_data in merged_flat.items():
        parts = cat_key.split("/")
        if parts[0] != "packages":
            continue
        if len(parts) == 2:
            pkg = parts[1]
            if pkg == "ai-insight":
                # 根目录只有 INDEX+README，合并到大模型卡片
                continue
            pkg_meta = PKG_DIR_MAP.get(pkg, {"displayName": pkg, "icon": "📁", "desc": ""})
            cards.append({
                "displayName": pkg_meta.get("displayName", pkg),
                "icon": pkg_meta.get("icon", "📁"),
                "count": cat_data["fileCount"],
                "layerTag": "L2-domain",
                "description": pkg_meta.get("desc", ""),
                "heatLevel": min(5, max(1, (cat_data["fileCount"] // 10) + 1)),
            })
        elif len(parts) == 3 and parts[1] == "ai-insight":
            sub = parts[2]
            sub_meta = AIINSIGHT_DIR_MAP.get(sub, {"displayName": sub, "icon": "📁", "desc": ""})
            # 特殊处理：concepts 和 entity-profiles 合并了四级文件
            desc = sub_meta.get("desc", "")
            if sub == "concepts":
                desc = "AI领域核心概念梳理：模型原理、Agent原理、AI应用、AI编程、企业转型、基础设施、AI安全"
            elif sub == "entity-profiles":
                desc = "AI领域关键公司与人物画像：22家公司档案+22位人物档案"
            elif sub == "insights":
                desc = "趋势分析与阶段性深度调研，含周洞察汇总"
            cards.append({
                "displayName": sub_meta.get("displayName", sub),
                "icon": sub_meta.get("icon", "📁"),
                "count": cat_data["fileCount"],
                "layerTag": "L2-domain",
                "description": desc,
                "heatLevel": min(5, max(1, (cat_data["fileCount"] // 10) + 1)),
            })

    # ai-insight 根目录文件合并到大模型
    ai_root = categories_flat.get("packages/ai-insight")
    if ai_root and ai_root["fileCount"] > 0:
        for c in cards:
            if c.get("displayName") == "大模型":
                c["count"] += ai_root["fileCount"]
                break

    # 构建 tree
    tree = {}
    LAYER_ICONS = {"L1-meta": "📖", "L2-domain": "🔍", "L3-execution": "📦"}
    LAYER_COLORS = {"L1-meta": "#a78bfa", "L2-domain": "#8b5cf6", "L3-execution": "#4ade80"}
    for card in cards:
        layer_tag = card["layerTag"]
        layer_label = next((l["label"] for l in LAYER_DEF if l["tag"] == layer_tag), "实践知识层")
        if layer_label not in tree:
            layer_def_entry = next((l for l in LAYER_DEF if l["tag"] == layer_tag), None)
            tree[layer_label] = {
                "layerTag": layer_tag,
                "displayName": layer_label,
                "icon": LAYER_ICONS.get(layer_tag, "📁"),
                "description": layer_def_entry["desc"] if layer_def_entry else "",
                "count": 0,
                "children": {}
            }
        tree[layer_label]["count"] += card["count"]
        tree[layer_label]["children"][card["displayName"]] = {
            "count": card["count"],
            "icon": card["icon"],
            "color": LAYER_COLORS[layer_tag],
            "description": card.get("description", ""),
            "heatLevel": card.get("heatLevel", 1),
            "relatedSkills": [],
            "relatedMemories": [],
            "items": [],
        }

    return {
        "totalFiles": total_files,
        "totalSizeKB": round(total_size_kb, 1),
        "categories": categories_flat,  # 扁平统计（兼容）
        "tree": tree,                    # 三层结构（前端渲染用）
    }


def update_memories():
    """扫描记忆目录 — v2.0 结构化记忆树（中文展示）"""
    memory_dir = WORKSPACE / "memory"
    total = 0
    by_category = {}

    MEM_CAT_LABELS = {
        "daily_log": "修炼日志",
        "clawbook": "社区互动",
        "learning": "学习笔记",
        "other": "其他记忆",
    }
    MEM_CAT_ICONS = {
        "daily_log": "📝",
        "clawbook": "👋",
        "learning": "📚",
        "other": "💭",
    }
    MEM_CAT_COLORS = {
        "daily_log": "#4ade80",
        "clawbook": "#00d4ff",
        "learning": "#fbbf24",
        "other": "#8b5cf6",
    }
    MEM_CAT_DESCS = {
        "daily_log": "每日修炼复盘、对话记录",
        "clawbook": "与ClawBook社区的互动与学习",
        "learning": "从经验中提炼的学习笔记",
        "other": "其他零散记忆片段",
    }

    # L1/L2/L3 映射
    MEM_CAT_LAYER = {
        "daily_log": "L1-meta",
        "clawbook": "L3-execution",
        "learning": "L2-domain",
        "other": "L3-execution",
    }

    if memory_dir.exists():
        for f in memory_dir.glob("*.md"):
            name = f.stem
            if name in ("INDEX", "skill_calls", "memory-maintenance", "feedback", "binding-list-batch4", "heartbeat-state"):
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
                by_category[cat] = {
                    "label": MEM_CAT_LABELS[cat],
                    "displayName": MEM_CAT_LABELS[cat],
                    "icon": MEM_CAT_ICONS[cat],
                    "color": MEM_CAT_COLORS[cat],
                    "description": MEM_CAT_DESCS[cat],
                    "count": 0,
                    "items": []
                }
            by_category[cat]["count"] += 1
            # 收集条目（截取标题）
            title = name
            if re.match(r"^\d{4}-\d{2}-\d{2}", name):
                title = f"{name} 修炼日志"
            elif "clawbook" in name:
                title = f"社区巡逻 {name.replace('clawbook-patrol-', '').replace('clawbook_', '')}"
            elif "til" in name:
                title = f"TIL {name.replace('til-', '')}"
            by_category[cat]["items"].append({
                "title": title,
                "icon": MEM_CAT_ICONS[cat],
                "importance": 3,
                "description": ""
            })

    # 构建 tree（三层架构）
    tree = {}
    for cat, cat_data in by_category.items():
        layer_tag = MEM_CAT_LAYER.get(cat, "L3-execution")
        layer_label = {"L1-meta": "元认知层", "L2-domain": "领域记忆层", "L3-execution": "实践记忆层", "SYSTEM": "系统约束层"}[layer_tag]
        if layer_label not in tree:
            layer_def = {
                "L1-meta": {"icon": "🧠", "desc": "用户身份、思维方法、做事方法"},
                "L2-domain": {"icon": "🎯", "desc": "特定领域的完整经验沉淀"},
                "L3-execution": {"icon": "🏗️", "desc": "具体领域的踩坑经验和项目知识"},
                "SYSTEM": {"icon": "⚙️", "desc": "系统自动提取的背景约束"},
            }
            tree[layer_label] = {
                "layerTag": layer_tag,
                "icon": layer_def[layer_tag]["icon"],
                "description": layer_def[layer_tag]["desc"],
                "count": 0,
                "children": {}
            }
        tree[layer_label]["count"] += cat_data["count"]
        tree[layer_label]["children"][cat_data["displayName"]] = {
            "count": cat_data["count"],
            "icon": cat_data["icon"],
            "color": cat_data["color"],
            "description": cat_data["description"],
            "items": cat_data["items"][:12],  # 最多展示12条
        }

    return {"total": total, "byCategory": by_category, "tree": tree}


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