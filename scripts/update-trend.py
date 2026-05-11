#!/usr/bin/env uv run
"""
趋势数据自动更新脚本

每次 skill-metrics.py 运行后调用此脚本，
将当前日期的四维数据追加到 reports-data.json 的 trend 历史中。

数据来源：character-data.json（skill-metrics.py 已更新后的版本）

运行方式：uv run scripts/update-trend.py
（通常由 skill-metrics.py 自动调用）
"""

import json
import os
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

WORKSPACE = _find_workspace().resolve()
HOMEPAGE_DIR = Path(__file__).parent.parent
DATA_FILE = HOMEPAGE_DIR / "character-data.json"
REPORTS_FILE = HOMEPAGE_DIR / "reports-data.json"

WEEKDAYS_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']


def update_trend():
    """从 character-data.json 读取当前数据，追加到 trend 历史"""
    
    # 读取 character-data
    if not DATA_FILE.exists():
        print("character-data.json 不存在，跳过趋势更新")
        return
    
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        char_data = json.load(f)
    
    today_str = date.today().strftime("%Y-%m-%d")
    today_short = date.today().strftime("%m-%d")
    weekday = WEEKDAYS_CN[date.today().weekday()]
    
    # 读取当前数据
    skills_total = char_data["skills"]["total"]
    knowledge_total = char_data["knowledge"]["totalFiles"]
    memories_total = char_data["memories"]["total"]
    
    # understanding 从 stats 读取（已经是百分比，需要还原为0-100的分数）
    stats = char_data["character"]["stats"]
    understanding_score = round(stats.get("understanding", 0) / 100 * 30, 1)  # 百分比→原始分数(0-30)
    
    # level 和 tier
    level = char_data["character"]["level"]
    tier_name = char_data["character"]["levelTitle"]
    
    # 读取或创建 reports-data
    if REPORTS_FILE.exists():
        with open(REPORTS_FILE, "r", encoding="utf-8") as f:
            reports_data = json.load(f)
    else:
        reports_data = {"reports": [], "trend": {"dates": [], "skills": [], "knowledge": [], "memory": [], "understanding": []}}
    
    # 更新 trend：追加今天的数据（如果今天已有则更新而非追加）
    trend = reports_data.get("trend", {})
    if not isinstance(trend, dict):
        trend = {"dates": [], "skills": [], "knowledge": [], "memory": [], "understanding": []}
    
    dates = trend.get("dates", [])
    
    if today_short in dates:
        # 今天已有数据，更新而非追加
        idx = dates.index(today_short)
        trend["skills"][idx] = skills_total
        trend["knowledge"][idx] = knowledge_total
        trend["memory"][idx] = memories_total
        trend["understanding"][idx] = understanding_score
    else:
        # 追加新数据
        dates.append(today_short)
        trend.setdefault("skills", []).append(skills_total)
        trend.setdefault("knowledge", []).append(knowledge_total)
        trend.setdefault("memory", []).append(memories_total)
        trend.setdefault("understanding", []).append(understanding_score)
    
    # 保留最近30天的数据（避免无限增长）
    max_days = 30
    if len(dates) > max_days:
        for key in ["dates", "skills", "knowledge", "memory", "understanding"]:
            if key in trend and len(trend[key]) > max_days:
                trend[key] = trend[key][-max_days:]
    
    reports_data["trend"] = trend
    
    # 更新 reports 列表：追加今天的简要日报条目
    reports = reports_data.get("reports", [])
    
    # 检查今天是否已有 report
    today_report_exists = any(r.get("date") == today_str for r in reports)
    
    if not today_report_exists:
        # 创建简要日报条目（完整日报由 daily-summary 模块生成）
        simple_report = {
            "date": today_str,
            "dayOfWeek": weekday,
            "level": level,
            "tier": tier_name,
            "skillCount": skills_total,
            "knowledgeCount": knowledge_total,
            "memoryCount": memories_total,
            "understandingScore": understanding_score,
            "conversationCount": 0,
            "deliveries": [],
            "attention": [],
            "pending": [],
            "todayPlan": [],
            "growthToday": {
                "memory": f"记忆{memories_total}条",
                "skill": f"技能{skills_total}项",
                "cognition": f"懂你程度{understanding_score}/30",
                "workflow": f"等级Lv.{level}"
            },
            "evoStats": {
                "summary": f"Lv.{level} {tier_name}，懂你{understanding_score}/30"
            },
            "skillChange": 0,
            "knowledgeChange": 0,
            "memoryChange": 0,
            "summaryStats": {
                "conversations": 0,
                "deliveries": 0,
                "projects": 0,
                "skills": skills_total
            }
        }
        reports.insert(0, simple_report)  # 最新的排前面
    
    # 保留最近14天的report条目
    if len(reports) > 14:
        reports = reports[:14]
    
    reports_data["reports"] = reports
    
    # 写回
    with open(REPORTS_FILE, "w", encoding="utf-8") as f:
        json.dump(reports_data, f, indent=2, ensure_ascii=False)
    
    print(f"趋势数据已更新至 {today_str} ({weekday})")
    print(f"  技能: {skills_total}  知识: {knowledge_total}  记忆: {memories_total}  懂你: {understanding_score}/30")
    print(f"  等级: Lv.{level} {tier_name}")
    print(f"  趋势数据点数: {len(dates)}")


if __name__ == "__main__":
    update_trend()