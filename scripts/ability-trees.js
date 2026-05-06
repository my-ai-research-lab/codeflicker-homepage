/**
 * 能力树渲染模块 v4.0 — 数据驱动架构（统一三层 + role 匹配）
 * Build: 20260309-0900
 * 核心原则：
 * - 所有分类名、技能名从 JSON 数据读取，不再硬编码中文
 * - 通过 role/layerTag 稳定标识符匹配分类，改名无需修改 JS
 * - displayName 从数据中读取，消除 skillNameMap 双重维护
 */

// ==================== 技能树 - 系统架构图 ====================
function renderSkillTechTree(container, skills) {
    if (!container) return;
    
    var tree = skills.tree;
    var categories = skills.categories;
    var relationships = skills.relationships || {};
    
    // 从 JSON 数据填充技能调用关系（单一数据源）— 必须用 window 赋值到全局变量
    window.SKILL_CALL_DATA = relationships.skill_calls || [];
    
    // 技能名称全部从数据读取（v4.0 — 消除 skillNameMap 硬编码）
    // displayName: 统一中文名（所有展示场景使用同一名称）, name: 英文标识符
    function getName(skill) {
        return skill.displayName || skill.name;
    }
    function getLevelColor(level) {
        var colors = { 1: '#fb923c', 2: '#fbbf24', 3: '#4ade80', 4: '#38bdf8', 5: '#a78bfa' };
        return colors[level] || '#4ade80';
    }
    
    function getLevelProgress(level, exp) {
        var progress = (exp || (level * 20)) / 100;
        return 50 * (1 - progress);
    }
    
    function isRecentlyUsed(lastUpdated) {
        if (!lastUpdated) return false;
        return (new Date() - new Date(lastUpdated)) / 86400000 <= 3;
    }
    
    var _idx = 0;
    // 根据 tag 字段返回四类标签：林克定制/快手定制/个人定制/通用
    function classifyByTag(tag, ksInternal, cfProject) {
        // 优先使用 tag 字段
        if (tag === 'Link') return { label: '林克定制', badge: '🔗' };
        if (tag === 'KS') return { label: '快手定制', badge: '🚀' };
        if (tag === 'SL') return { label: '个人定制', badge: '👤' };
        // 兼容旧标志
        if (ksInternal) return { label: '快手定制', badge: '🚀' };
        if (cfProject) return { label: '林克定制', badge: '🔗' };
        // 无标签为通用
        return { label: '通用', badge: '📦' };
    }
    function storeSkill(skill) {
        var id = 'skill-' + (_idx++);
        var src = classifyByTag(skill.tag, skill.ksInternal, skill.cfProject);
        window.AppState.dataMap[id] = {
            name: getName(skill), icon: '\u26A1', level: skill.level || 1,
            description: skill.description || '', source: skill.source || '技能库',
            sourceLabel: src.label, sourceBadge: src.badge,
            exp: skill.exp || 0, lastUpdated: skill.lastUpdated,
            callCount: skill.callCount || 0,
            frequency: skill.frequency || '',
            successRate: skill.successRate || 0,
            skillSize: skill.skillSize || 0,
            skillSizeLabel: skill.skillSizeLabel || '',
            ksInternal: skill.ksInternal || false,
            cfProject: skill.cfProject || false,
            tag: skill.tag || ''
        };
        return id;
    }
    function storeGeneric(icon, name, desc, level) {
        var id = 'gen-' + (_idx++);
        window.AppState.dataMap[id] = {
            name: name, icon: icon || '\uD83D\uDD18', level: level || '',
            description: desc || '', source: ''
        };
        return id;
    }
    
    // 保留兼容层（app.js 可能引用 window.SKILL_NAME_MAP）
    if (!window.SKILL_NAME_MAP) {
        window.SKILL_NAME_MAP = {};
        // 从数据中动态构建映射
        function _buildNameMap(cats) {
            if (!cats) return;
            Object.values(cats).forEach(function(cat) {
                (cat.skills || []).forEach(function(s) {
                    if (s.name) window.SKILL_NAME_MAP[s.name] = s.displayName || s.name;
                });
            });
        }
        if (tree) {
            _buildNameMap((tree.engine || {}).children);
            _buildNameMap((tree.meta || {}).children);
            _buildNameMap((tree.domain || {}).children);
            _buildNameMap((tree.tool || {}).children);
        }
    }
    
    function createEngineNode(skill, role, tier) {
        var id = storeSkill(skill);
        var name = getName(skill);
        var level = skill.level || 1;
        var exp = skill.exp || (level * 20);
        var color = getLevelColor(level);
        var dashOffset = getLevelProgress(level, exp);
        var recent = isRecentlyUsed(skill.lastUpdated);
        var tierClass = tier === 'guide' ? 'engine-node--guide' : tier === 'core' ? 'engine-node--core' : 'engine-node--tool';
        
        return '<div class="engine-node ' + tierClass + '" data-skill="' + skill.name + '" style="--node-color: ' + color + ';" onmouseenter="showTreeTooltip(event, \'' + id + '\', \'skill\')" onmouseleave="hideTooltip()">' +
            (recent ? '<span class="skill-recent-badge"></span>' : '') +
            '<div class="engine-node-ring"><svg viewBox="0 0 22 22" width="22" height="22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + dashOffset + '" style="stroke:' + color + ';"/></svg><span class="engine-node-level">' + level + '</span></div>' +
            '<div class="engine-node-info"><span class="engine-node-name">' + name + '</span><span class="engine-node-role">' + role + '</span></div></div>';
    }
    
    function getSourceColor(source) {
        if (!source) return 'rgba(200, 220, 240, 0.2)';
        if (source === '林克核心能力' || source === 'AI核心能力') return '#a78bfa';
        if (source === '用户自定义') return '#38bdf8';
        return '#64748b'; // 平台技能库
    }
    
    function createSkillChip(skill) {
        var id = storeSkill(skill);
        var name = getName(skill);
        var level = skill.level || 1;
        var color = getLevelColor(level);
        var sourceColor = getSourceColor(skill.source);
        // 归属标签：优先用 tag 字段（KS/SL/Link），兼容旧 ksInternal/cfProject 标志
        var ownerTag = '';
        if (skill.tag === 'KS') {
            ownerTag = '<span class="skill-chip-ks">KS</span>';
        } else if (skill.tag === 'SL') {
            ownerTag = '<span class="skill-chip-sl">SL</span>';
        } else if (skill.tag === 'Link') {
            ownerTag = '<span class="skill-chip-link">Link</span>';
        } else if (skill.ksInternal) {
            ownerTag = '<span class="skill-chip-ks">KS</span>';
        } else if (skill.cfProject) {
            ownerTag = '<span class="skill-chip-link">Link</span>';
        }
        var sizeTag = skill.skillSizeLabel ? '<span class="skill-chip-size">' + Math.round(skill.skillSize / 1000) + 'K</span>' : '';
        // 标签顺序：级别 → 归属标签 → 名称 → 规模
        return '<div class="skill-chip" data-skill-name="' + skill.name + '" style="--chip-color:' + color + ';--chip-source-color:' + sourceColor + ';" onmouseenter="showTreeTooltip(event, \'' + id + '\', \'skill\')" onmouseleave="hideTooltip()"><span class="skill-chip-level">' + level + '</span>' + ownerTag + '<span class="skill-chip-name">' + name + '</span>' + sizeTag + '</div>';
    }
    
    // ========== 渲染 ==========
    if (!tree || Object.keys(tree).length === 0) {
        renderSkillTechTreeFlat(container, categories, skills.total);
        return;
    }
    
    var engineLayer = tree.engine || {};
    var metaLayer = tree.meta || {};
    var domainLayer = tree.domain || {};
    var toolLayer = tree.tool || {};
    var engineRoles = relationships.engine_roles || {};
    
    // L1引擎层子分类 — 从 engineLayer.children 读取
    var engineChildren = engineLayer.children || {};
    var engineCat = null;
    var eKeys = Object.keys(engineChildren);
    for (var ek = 0; ek < eKeys.length; ek++) {
        var ec = engineChildren[eKeys[ek]];
        if (ec.role === 'evolution') engineCat = ec;
    }

    // L2元能力层子分类 — 按 role 稳定标识符匹配（六维）
    var metaChildren = metaLayer.children || {};
    var perceptionCat = null, reasoningCat = null, executionCat = null, collaborationCat = null, expressionCat = null;
    var metaKeys = Object.keys(metaChildren);
    for (var mk = 0; mk < metaKeys.length; mk++) {
        var mc = metaChildren[metaKeys[mk]];
        if (mc.role === 'perception') perceptionCat = mc;
        else if (mc.role === 'reasoning') reasoningCat = mc;
        else if (mc.role === 'execution') executionCat = mc;
        else if (mc.role === 'collaboration') collaborationCat = mc;
        else if (mc.role === 'expression') expressionCat = mc;
    }
    
    // 引擎技能映射 — 从 engineLayer 读取
    var engineSkillMap = {};
    if (engineCat && engineCat.skills) {
        for (var i = 0; i < engineCat.skills.length; i++) {
            engineSkillMap[engineCat.skills[i].name] = engineCat.skills[i];
        }
    }
    // 从全部技能中补充获取可能不在引擎分类中的技能
    function findSkillByName(skillName) {
        if (engineSkillMap[skillName]) return engineSkillMap[skillName];
        // 遍历所有分类查找
        var allLayers = [engineChildren, metaChildren, (domainLayer.children || {}), (toolLayer.children || {})];
        for (var li = 0; li < allLayers.length; li++) {
            var layerCats = allLayers[li];
            var catKeys = Object.keys(layerCats);
            for (var ci = 0; ci < catKeys.length; ci++) {
                var cat = layerCats[catKeys[ci]];
                if (cat.skills) {
                    for (var si = 0; si < cat.skills.length; si++) {
                        if (cat.skills[si].name === skillName) {
                            engineSkillMap[skillName] = cat.skills[si]; // 缓存
                            return cat.skills[si];
                        }
                    }
                }
            }
        }
        return null;
    }
    
    var guideSkill = findSkillByName('meta-xiaowuxianggong');
    var absorbSkill = findSkillByName('meta-xixingdafa');
    var exportSkill = findSkillByName('meta-beiming-shengong');
    var coreSkill = findSkillByName('meta-daily-reflection-evolution');
    var reviewSkill = findSkillByName('meta-learn-from-mistakes');
    // v13.0: 内功修炼已废弃，不再查找
    var toolNames = ['meta-memory-hygiene', 'meta-skill-management', 'meta-knowledge-curator'];
    var toolSkills = [];
    for (var t = 0; t < toolNames.length; t++) {
        var ts = findSkillByName(toolNames[t]);
        if (ts) toolSkills.push(ts);
    }
    var techniqueNames = ['meta-find-skills', 'meta-skill-creator', 'meta-skill-evaluator', 'meta-skill-dojo'];
    var techniqueSkills = [];
    for (var tt = 0; tt < techniqueNames.length; tt++) {
        var tsk = findSkillByName(techniqueNames[tt]);
        if (tsk) techniqueSkills.push(tsk);
    }
    
    // === 引擎区域（完全遵循Demo页面结构） ===
    var engineHtml = '';
    if (guideSkill && coreSkill) {
        // 获取所有需要的技能
        var proactiveSkill = findSkillByName('meta-proactive-agent');
        var homepageSkill = findSkillByName('link-homepage');
        
        // 创建节点（使用与demo完全一致的类名）
        function createDemoNode(skill, displayName, role, variant, nodeId) {
            if (!skill) return '';
            var id = storeSkill(skill);
            var level = skill.level || 1;
            var exp = skill.exp || (level * 20);
            var dash = 50 * (1 - exp / 100);
            var colorMap = {
                'absorb': '#38bdf8',
                'guide': '#a78bfa', 
                'export': '#4ade80',
                'core': '#fb923c',
                'proactive': '#fb923c',
                'tool': '#4ade80',
                'lifecycle': 'rgba(200, 220, 240, 0.6)',
                'homepage': '#38bdf8'
            };
            var color = colorMap[variant] || '#a78bfa';
            var nodeClass = 'engine-node engine-node--' + variant;
            var idAttr = nodeId ? 'id="' + nodeId + '"' : '';
            
            return '<div ' + idAttr + ' class="' + nodeClass + '" onmouseenter="showTreeTooltip(event, \'' + id + '\', \'skill\')" onmouseleave="hideTooltip()">' +
                '<div class="engine-node-ring">' +
                    '<svg viewBox="0 0 22 22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + dash + '" style="stroke: ' + color + ';"/></svg>' +
                    '<span class="engine-node-level">' + level + '</span>' +
                '</div>' +
                '<div class="engine-node-info">' +
                    '<span class="engine-node-name">' + displayName + '</span>' +
                    '<span class="engine-node-role">' + role + '</span>' +
                '</div>' +
            '</div>';
        }
        
        // 三大功法节点
        var absorbNodeHtml = absorbSkill ? createDemoNode(absorbSkill, '吸星大法', '外部吸收', 'absorb') : '';
        var guideNodeHtml = createDemoNode(guideSkill, '小无相功', '进化导航', 'guide');
        var exportNodeHtml = exportSkill ? createDemoNode(exportSkill, '北冥神功', '能力导出', 'export') : '';
        
        // 核心能力节点
        var proactiveNodeHtml = proactiveSkill ? createDemoNode(proactiveSkill, '主动自驱', '让引擎自己动', 'proactive') : '';
        var coreNodeHtml = createDemoNode(coreSkill, '闭关修炼', '每日流水线', 'core');
        
        // 双轮驱动节点（直接读 displayName/displayRole，无硬编码映射）
        // v13.0: 内功修炼已废弃，只保留经验总结
        var reviewNodeHtml = reviewSkill ? createDemoNode(reviewSkill, reviewSkill.displayName || getName(reviewSkill), reviewSkill.displayRole || '复盘', 'tool') : '';
        
        // 系统优化工具节点（直接读 displayRole，无硬编码 toolDisplayNames/toolRoleNames）
        var toolNodesHtml = '';
        var toolNodeIds = { 'meta-memory-hygiene': 'node-memory' }; // 记忆优化需要ID以便L形连接器定位
        for (var ti = 0; ti < toolSkills.length; ti++) {
            var ts = toolSkills[ti];
            var tsName = ts.displayName || getName(ts);
            var tsRole = ts.displayRole || '基座工具';
            var tsId = toolNodeIds[ts.name] || null;
            if (ti > 0) {
                var pDelay = (ti - 1) * 0.9;
                toolNodesHtml += '<div class="tools-connector"><div class="connector-h"></div><div class="arrow-right"></div><div class="energy-particles"><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: ' + pDelay + 's;"></div><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: ' + (pDelay + 1.1) + 's;"></div></div></div>';
            }
            toolNodesHtml += createDemoNode(ts, tsName, tsRole, 'tool', tsId);
        }
        // 林克首页节点
        if (homepageSkill) {
            toolNodesHtml += '<div class="tools-connector"><div class="connector-h"></div><div class="arrow-right"></div><div class="energy-particles"><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: 0s;"></div><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: 1.1s;"></div></div></div>';
            toolNodesHtml += createDemoNode(homepageSkill, homepageSkill.displayName || '林克首页', homepageSkill.displayRole || '对外门面', 'homepage');
        }
        
        // 技能生命周期节点（v13.5: 标题放在U形闭环内左侧，与技能发现同行）
        var lifecycleHtml = '';
        if (techniqueSkills.length > 0) {
            // 新布局：标题在技能发现节点左边，同行显示（v13.9: 删除"技能生命周期"标签和箭头）
            lifecycleHtml = '<div class="lifecycle-section lifecycle-section--compact"><div class="lifecycle-flow">';
            // v13.9: 移除左侧标题和第一个连接器
            var skillNames = ['技能发现', '技能创建', '技能评估', '技能修炼'];
            var skillRoles = ['搜索市场技能', '从零编写技能', '评测质量分数', '持续精进优化'];
            for (var ti2 = 0; ti2 < techniqueSkills.length; ti2++) {
                var sk = techniqueSkills[ti2];
                var skid = storeSkill(sk);
                var sklevel = sk.level || 1;
                var skexp = sk.exp || (sklevel * 20);
                var skdash = 50 * (1 - skexp / 100);
                var nodeId = ti2 === 0 ? 'id="node-skill-find"' : (ti2 === techniqueSkills.length - 1 ? 'id="node-skill-dojo"' : '');
                // v13.9: 移除第一个节点前的连接器
                lifecycleHtml += '<div ' + nodeId + ' class="engine-node engine-node--lifecycle" onmouseenter="showTreeTooltip(event, \'' + skid + '\', \'skill\')" onmouseleave="hideTooltip()">' +
                    '<div class="engine-node-ring"><svg viewBox="0 0 22 22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + skdash + '" style="stroke: rgba(200, 220, 240, 0.6);"/></svg><span class="engine-node-level">' + sklevel + '</span></div>' +
                    '<div class="engine-node-info"><span class="engine-node-name">' + skillNames[ti2] + '</span><span class="engine-node-role">' + skillRoles[ti2] + '</span></div></div>';
                if (ti2 < techniqueSkills.length - 1) {
                    var particleDelay = ti2 * 0.5;
                    lifecycleHtml += '<div class="lifecycle-connector"><div class="connector-h" style="--line-from: rgba(167, 139, 250, 0.4); --line-to: rgba(56, 189, 248, 0.4);"></div><div class="arrow-right" style="--arrow-color: rgba(56, 189, 248, 0.5);"></div><div class="energy-particles"><div class="energy-particle" style="--particle-color: #a78bfa; --particle-duration: 2s; animation-delay: ' + particleDelay + 's;"></div></div></div>';
                }
            }
            // U形闭环底部的"社区学习"标签
            lifecycleHtml += '<span class="lifecycle-feedback-label connector-label" style="--label-color: rgba(167, 139, 250, 0.85); --label-border: rgba(167, 139, 250, 0.4);">社区学习</span>';
            lifecycleHtml += '</div></div>';
        }
        
        // 组装完整的引擎HTML（完全遵循Demo结构）
        engineHtml = '<div class="engine-section">' +
            '<div class="engine-header"><span class="engine-icon">\uD83D\uDD04</span><span class="engine-title">自进化引擎</span><span class="engine-desc">驱动持续进化的核心引擎</span></div>' +
            '<div class="engine-body">' +
                // 内功运转能量环
                '<div class="energy-ring energy-ring--1"></div>' +
                '<div class="energy-ring energy-ring--2"></div>' +
                '<div class="energy-ring energy-ring--3"></div>' +
                // 三大功法
                '<div class="three-techniques">' +
                    absorbNodeHtml +
                    '<div class="technique-connector"><div class="connector-h" style="--line-from: #38bdf8; --line-to: #a78bfa;"></div><div class="arrow-right" style="--arrow-color: #a78bfa;"></div><span class="connector-label connector-label--center" style="--label-color: #38bdf8; --label-border: rgba(56, 189, 248, 0.4);">增强</span><div class="energy-particles"><div class="energy-particle" style="--particle-color: #38bdf8; animation-delay: 0s;"></div><div class="energy-particle" style="--particle-color: #38bdf8; animation-delay: 0.8s;"></div></div></div>' +
                    guideNodeHtml +
                    '<div class="technique-connector"><div class="connector-h" style="--line-from: #a78bfa; --line-to: #4ade80;"></div><div class="arrow-right" style="--arrow-color: #4ade80;"></div><span class="connector-label connector-label--center" style="--label-color: #4ade80; --label-border: rgba(74, 222, 128, 0.4);">导出</span><div class="energy-particles"><div class="energy-particle" style="--particle-color: #4ade80; animation-delay: 0.3s;"></div><div class="energy-particle" style="--particle-color: #4ade80; animation-delay: 1.1s;"></div></div></div>' +
                    exportNodeHtml +
                '</div>' +
                // 导航连接
                '<div class="nav-connector-section"><div class="connector-v connector-v--animated" style="--line-from: #a78bfa; --line-to: #fb923c;"></div><div class="arrow-down" style="--arrow-color: #fb923c;"></div><span class="connector-label connector-label--side" style="--label-color: #a78bfa; --label-border: rgba(167, 139, 250, 0.4);">导航调度</span><div class="energy-particles"><div class="energy-particle" style="--particle-color: #a78bfa; --particle-animation: particle-v; animation-delay: 0.5s;"></div></div></div>' +
                // 核心能力区
                '<div class="core-section"><div class="core-row">' +
                    proactiveNodeHtml +
                    '<div class="core-connector"><div class="connector-h" style="--line-from: #fb923c; --line-to: #fb923c;"></div><div class="arrow-right" style="--arrow-color: #fb923c;"></div><span class="connector-label connector-label--center" style="--label-color: #fb923c; --label-border: rgba(251, 146, 60, 0.4);">触发</span><div class="energy-particles"><div class="energy-particle" style="--particle-color: #fb923c; --particle-duration: 1.5s; animation-delay: 0s;"></div><div class="energy-particle" style="--particle-color: #fb923c; --particle-duration: 1.5s; animation-delay: 0.7s;"></div></div></div>' +
                    '<div id="node-biguan" class="engine-node engine-node--core" onmouseenter="showTreeTooltip(event, \'' + storeSkill(coreSkill) + '\', \'skill\')" onmouseleave="hideTooltip()"><div class="engine-node-ring"><svg viewBox="0 0 22 22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + (50 * (1 - (coreSkill.exp || (coreSkill.level || 1) * 20) / 100)) + '" style="stroke: #fb923c;"/></svg><span class="engine-node-level">' + (coreSkill.level || 1) + '</span></div><div class="engine-node-info"><span class="engine-node-name">闭关修炼</span><span class="engine-node-role">每日流水线</span></div></div>' +
                '</div></div>' +
                // v13.0: 经验总结移到系统优化工具左边，直接连接到记忆体系优化
                // 系统优化工具（前置经验总结）
                '<div class="system-tools"><div class="tools-grid">' +
                    // 经验总结节点
                    '<div id="node-jingyan" class="engine-node engine-node--tool" onmouseenter="showTreeTooltip(event, \'' + storeSkill(reviewSkill) + '\', \'skill\')" onmouseleave="hideTooltip()"><div class="engine-node-ring"><svg viewBox="0 0 22 22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + (50 * (1 - ((reviewSkill && reviewSkill.exp) || ((reviewSkill && reviewSkill.level) || 1) * 20) / 100)) + '" style="stroke: #4ade80;"/></svg><span class="engine-node-level">' + ((reviewSkill && reviewSkill.level) || 1) + '</span></div><div class="engine-node-info"><span class="engine-node-name">经验总结</span><span class="engine-node-role">复盘并举一反三</span></div></div>' +
                    // 经验总结 → 记忆体系优化 连接器
                    '<div class="tools-connector"><div class="connector-h" style="--line-from: #4ade80; --line-to: #4ade80;"></div><div class="arrow-right" style="--arrow-color: #4ade80;"></div><div class="energy-particles"><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: 0s;"></div><div class="energy-particle" style="--particle-color: #4ade80; --particle-duration: 2.2s; animation-delay: 1.1s;"></div></div></div>' +
                    // 系统优化工具节点
                    toolNodesHtml +
                '</div></div>' +
                // 技能生命周期
                lifecycleHtml +
            '</div>' +
        '</div>';
    }
    
    // === L2元能力层 — 六维分型 ===
    // 渲染每个维度为一个 method-section
    var metaDimSections = '';
    var dimConfigs = [
        { cat: perceptionCat, icon: '👁️', title: '感知维度', desc: '看清输入 — 上下文质量和信号筛选', colorVar: 'var(--cognitive-yellow)' },
        { cat: reasoningCat, icon: '🧠', title: '推理维度', desc: '深层判断 — 类比迁移、本质洞察、不确定性量化', colorVar: 'var(--cognitive-yellow)' },
        { cat: executionCat, icon: '⚙️', title: '执行维度', desc: '精准落地 — 边界感知和调试诊断', colorVar: 'var(--system-teal)' },
        { cat: collaborationCat, icon: '🤝', title: '协作维度', desc: '人机对齐 — 信任建立和透明度', colorVar: 'var(--cognitive-yellow)' },
        { cat: expressionCat, icon: '📝', title: '表达维度', desc: '输出质量 — 写作规范基础层', colorVar: 'var(--cognitive-yellow)' }
    ];
    for (var dc = 0; dc < dimConfigs.length; dc++) {
        var dimCfg = dimConfigs[dc];
        var dimCat = dimCfg.cat;
        if (!dimCat || !dimCat.skills || dimCat.skills.length === 0) continue;
        var dimNodes = '';
        for (var di = 0; di < dimCat.skills.length; di++) {
            var ds = dimCat.skills[di];
            var did = storeSkill(ds);
            var dlevel = ds.level || 1;
            var dexp = ds.exp || (dlevel * 20);
            var ddash = 50 * (1 - dexp / 100);
            dimNodes += '<div class="engine-node" onmouseenter="showTreeTooltip(event, \'' + did + '\', \'skill\')" onmouseleave="hideTooltip()">' +
                '<div class="engine-node-ring"><svg viewBox="0 0 22 22"><circle class="ring-bg" cx="11" cy="11" r="8"/><circle class="ring-progress" cx="11" cy="11" r="8" stroke-dasharray="50" stroke-dashoffset="' + ddash + '" style="stroke: ' + dimCfg.colorVar + ';"/></svg><span class="engine-node-level">' + dlevel + '</span></div>' +
                '<div class="engine-node-info"><span class="engine-node-name">' + (ds.displayName || getName(ds)) + '</span><span class="engine-node-role">' + (ds.displayRole || '元能力') + '</span></div></div>';
        }
        metaDimSections += '<div class="method-section method-section--cognitive">' +
            '<div class="method-header"><span class="method-icon">' + dimCfg.icon + '</span><span class="method-title">' + dimCfg.title + '</span><span class="method-desc">' + dimCfg.desc + '</span></div>' +
            '<div class="method-content"><div class="method-grid">' + dimNodes + '</div></div></div>';
    }
    
    function renderLayerTransition(text) {
        return '<div class="layer-transition"><div class="transition-line"></div><span class="transition-label">' + text + '</span><div class="transition-line"></div><div class="transition-arrow">\u25BC</div></div>';
    }
    
    // === 领域技能包 ===
    var domainHtml = '';
    if (domainLayer.children && Object.keys(domainLayer.children).length > 0) {
        var domainCards = '';
        var dEntries = Object.entries(domainLayer.children);
        for (var di = 0; di < dEntries.length; di++) {
            var dName = dEntries[di][0];
            var dInfo = dEntries[di][1];
            var dClean = dName.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]+\s*/gu, '').trim();
            var dChips = '';
            var dSkills = dInfo.skills || [];
            for (var ds = 0; ds < dSkills.length; ds++) { dChips += createSkillChip(dSkills[ds]); }
            var domId = storeGeneric(dInfo.icon || '\uD83C\uDFAF', dClean, (dInfo.description || '') + '\n包含 ' + dSkills.length + ' 个技能', '');
            domainCards += '<div class="domain-card" style="--domain-color:' + (dInfo.color || '#8b5cf6') + ';" onmouseenter="showTreeTooltip(event, \'' + domId + '\', \'skill\')" onmouseleave="hideTooltip()"><div class="domain-card-header"><span class="domain-card-icon">' + (dInfo.icon || '\uD83C\uDFAF') + '</span><span class="domain-card-name">' + dClean + '</span></div><div class="domain-card-desc">' + (dInfo.description || '') + '</div><div class="domain-card-skills">' + dChips + '</div></div>';
        }
        domainHtml = '<div class="domain-layer"><div class="domain-layer-header"><span class="domain-layer-icon">\uD83C\uDFAF</span><span class="domain-layer-title">领域能力层</span><span class="domain-layer-desc">特定领域的完整解决方案</span></div><div class="domain-cards-grid">' + domainCards + '</div></div>';
    }
    
    // === 工具层 ===
    var execHtml = '';
    if (toolLayer.children && Object.keys(toolLayer.children).length > 0) {
        var execGroups = '';
        var eEntries = Object.entries(toolLayer.children);
        for (var ei = 0; ei < eEntries.length; ei++) {
            var eName = eEntries[ei][0];
            var eInfo = eEntries[ei][1];
            var eClean = eName.replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]+\s*/gu, '').trim();
            // 按 tag 分四层：Link（林克定制）→ KS（快手定制）→ SL（个人定制）→ 共同（无标记）
            var eSkills = eInfo.skills || [];
            var linkSkills = [], ksSkills = [], slSkills = [], genericSkills = [];
            for (var es = 0; es < eSkills.length; es++) {
                var sk = eSkills[es];
                var skTag = sk.tag || (sk.ksInternal ? 'KS' : (sk.cfProject ? 'Link' : ''));
                if (skTag === 'Link') linkSkills.push(sk);
                else if (skTag === 'KS') ksSkills.push(sk);
                else if (skTag === 'SL') slSkills.push(sk);
                else genericSkills.push(sk);
            }
            // 构建分层 chips（顺序：林克定制 → 快手定制 → 个人定制 → 共同）
            var eChips = '';
            if (linkSkills.length > 0) {
                var linkChips = '';
                for (var li = 0; li < linkSkills.length; li++) linkChips += createSkillChip(linkSkills[li]);
                eChips += '<div class="exec-sublayer exec-sublayer-link"><span class="exec-sublayer-label">林克定制</span><div class="exec-sublayer-chips">' + linkChips + '</div></div>';
            }
            if (ksSkills.length > 0) {
                var ksChips = '';
                for (var ki = 0; ki < ksSkills.length; ki++) ksChips += createSkillChip(ksSkills[ki]);
                eChips += '<div class="exec-sublayer exec-sublayer-ks"><span class="exec-sublayer-label">快手定制</span><div class="exec-sublayer-chips">' + ksChips + '</div></div>';
            }
            if (slSkills.length > 0) {
                var slChips = '';
                for (var si = 0; si < slSkills.length; si++) slChips += createSkillChip(slSkills[si]);
                eChips += '<div class="exec-sublayer exec-sublayer-sl"><span class="exec-sublayer-label">个人定制</span><div class="exec-sublayer-chips">' + slChips + '</div></div>';
            }
            if (genericSkills.length > 0) {
                var gChips = '';
                for (var gi = 0; gi < genericSkills.length; gi++) gChips += createSkillChip(genericSkills[gi]);
                eChips += '<div class="exec-sublayer exec-sublayer-generic"><span class="exec-sublayer-label">通用</span><div class="exec-sublayer-chips">' + gChips + '</div></div>';
            }
            var execId = storeGeneric(eInfo.icon || '\uD83D\uDEE0\uFE0F', eClean, '包含 ' + (eInfo.count || 0) + ' 个技能', '');
            execGroups += '<div class="exec-group" onmouseenter="showTreeTooltip(event, \'' + execId + '\', \'skill\')" onmouseleave="hideTooltip()"><div class="exec-group-header"><span class="exec-group-icon">' + (eInfo.icon || '\uD83D\uDEE0\uFE0F') + '</span><span class="exec-group-name">' + eClean + '</span><span class="exec-group-count">' + (eInfo.count || 0) + '</span></div><div class="exec-group-chips">' + eChips + '</div></div>';
        }
        execHtml = '<div class="exec-layer" id="exec-layer-toggle"><div class="exec-layer-header" onclick="toggleExecLayer()"><span class="exec-layer-icon">\uD83D\uDEE0\uFE0F</span><span class="exec-layer-title">工具层</span><span class="exec-layer-desc">平台提供，拿来就用，不维护</span><span class="exec-layer-count">' + (toolLayer.count || 0) + '</span><span class="exec-layer-toggle-icon">\u25BC</span></div><div class="exec-layer-content"><div class="exec-groups-grid">' + execGroups + '</div></div></div>';
    }
    
    // ========== 组装 ==========
    container.innerHTML = '<div class="skill-architecture">' +
        '<div class="meta-layer"><div class="meta-layer-label"><span class="meta-label-icon">\uD83D\uDD04</span><span class="meta-label-text">引擎层</span><span class="meta-label-desc">自进化闭环</span></div><div class="meta-layer-content">' + engineHtml + '</div></div>' +
        renderLayerTransition('引擎驱动元能力') +
        '<div class="meta-layer"><div class="meta-layer-label"><span class="meta-label-icon">\uD83E\uDDE0</span><span class="meta-label-text">元能力层</span><span class="meta-label-desc">六维分型 — 感知·推理·执行·协作·表达</span></div><div class="meta-layer-content">' + metaDimSections + '</div></div>' +
        renderLayerTransition('元能力驱动领域能力') +
        domainHtml +
        renderLayerTransition('领域调用工具技能') +
        execHtml +
    '</div>';
    
    // 渲染完成后绘制所有动态连线
    setTimeout(function() {
        if (typeof drawElbowConnectors === 'function') {
            drawElbowConnectors();
        }
        if (typeof drawLifecycleLoop === 'function') {
            drawLifecycleLoop();
        }
        if (typeof drawSkillCallConnectors === 'function') {
            drawSkillCallConnectors();
        }
    }, 100);
}

function toggleExecLayer() {
    var el = document.getElementById('exec-layer-toggle');
    if (el) el.classList.toggle('collapsed');
}
window.toggleExecLayer = toggleExecLayer;

function renderSkillTechTreeFlat(container, categories, total) {
    container.innerHTML = '<div class="skill-tech-tree"><div class="skill-root-node"><span class="skill-root-icon">\u26A1</span><span class="skill-root-label">技能</span><span class="skill-root-count">' + (total || 0) + '</span></div><div style="text-align:center;padding:20px;color:var(--text-muted);">正在加载技能数据...</div></div>';
}

function toggleSkillLayerCard(header) {
    var card = header.closest('.skill-layer-card');
    if (card) card.classList.toggle('collapsed');
}
window.toggleSkillLayerCard = toggleSkillLayerCard;

// ==================== 知识树 - 纵向三层架构图（v3.0） ====================
function renderKnowledgeArchive(container, knowledge) {
    if (!container) return;
    
    var layerDef = [
        { tag: 'L1-meta', icon: '\uD83D\uDCD6', label: '\u57fa\u5ea7\u77e5\u8bc6\u5c42', color: '#a78bfa', border: 'rgba(167,139,250,0.25)', bg: 'rgba(18,15,30,0.95)', desc: '\u652f\u6491\u5143\u80fd\u529b\u7684\u601d\u60f3\u548c\u65b9\u6cd5\u8bba', align: '\u2194 \u5143\u80fd\u529b\u5c42 \u00b7 \u5143\u8ba4\u77e5\u5c42' },
        { tag: 'L2-domain', icon: '\uD83D\uDD0D', label: '\u9886\u57df\u77e5\u8bc6\u5c42', color: '#8b5cf6', border: 'rgba(139,92,246,0.25)', bg: 'rgba(16,12,28,0.95)', desc: '\u7279\u5b9a\u9886\u57df\u7684\u6df1\u5ea6\u7814\u7a76\u548c\u77e5\u8bc6\u6c89\u6dc0', align: '\u2194 \u9886\u57df\u80fd\u529b\u5c42 \u00b7 \u9886\u57df\u8bb0\u5fc6\u5c42' },
        { tag: 'L3-execution', icon: '\uD83D\uDCE6', label: '\u5b9e\u8df5\u77e5\u8bc6\u5c42', color: '#4ade80', border: 'rgba(74,222,128,0.25)', bg: 'rgba(10,20,15,0.95)', desc: '\u5177\u4f53\u6267\u884c\u4e2d\u4ea7\u51fa\u7684\u65b9\u6848\u548c\u6587\u6863', align: '\u2194 \u6267\u884c\u6280\u80fd\u5c42 \u00b7 \u5b9e\u8df5\u8bb0\u5fc6\u5c42' }
    ];
    
    // Build per-layer category lists from tree or flat categories
    var layerCats = {};
    layerDef.forEach(function(l){ layerCats[l.tag] = []; });
    
    var src = (knowledge.tree && Object.keys(knowledge.tree).length > 0) ? 'tree' : 'flat';
    if (src === 'tree') {
        Object.keys(knowledge.tree).forEach(function(layerName) {
            var li = knowledge.tree[layerName];
            var tag = li.layerTag || 'L3-execution';
            var cats = li.categories || {};
            Object.keys(cats).forEach(function(k) { var c = cats[k]; c._key = k; if (!layerCats[tag]) layerCats[tag] = []; layerCats[tag].push(c); });
        });
    } else if (knowledge.categories) {
        Object.keys(knowledge.categories).forEach(function(k) { var c = knowledge.categories[k]; c._key = k; var t = c.layerTag || 'L3-execution'; if (!layerCats[t]) layerCats[t] = []; layerCats[t].push(c); });
    }
    
    var totalFiles = knowledge.totalFiles || 0;
    var totalCats = 0;
    layerDef.forEach(function(l){ totalCats += layerCats[l.tag].length; });
    
    if (totalCats === 0) { container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);">\uD83D\uDCDA \u6682\u65e0\u77e5\u8bc6\u5e93\u6570\u636e</div>'; return; }
    
    // Header
    var html = '<div class="knowledge-arch">';
    
    var maxCount = 1;
    layerDef.forEach(function(l){ layerCats[l.tag].forEach(function(c){ if ((c.fileCount||0) > maxCount) maxCount = c.fileCount||0; }); });
    
    // Render each layer
    for (var li = 0; li < layerDef.length; li++) {
        var ld = layerDef[li];
        var cats = layerCats[ld.tag];
        if (cats.length === 0) continue;
        
        var layerFiles = 0;
        cats.forEach(function(c){ layerFiles += c.fileCount || 0; });
        
        html += '<div class="kn-layer" style="border-color:' + ld.border + ';">';
        html += '<div class="kn-layer-label" style="border-bottom-color:' + ld.border + ';"><span class="kn-label-icon">' + ld.icon + '</span><span class="kn-label-text" style="color:' + ld.color + ';">' + ld.label + '</span><span class="kn-label-desc">' + ld.desc + '</span><span class="kn-label-align">' + ld.align + '</span><span class="kn-label-count" style="color:' + ld.color + ';">' + layerFiles + ' \u6587\u6863</span></div>';
        html += '<div class="kn-layer-content"><div class="kn-cards-grid">';
        
        for (var ci = 0; ci < cats.length; ci++) {
            var cat = cats[ci];
            var name = cat.displayName || cat.name || cat._key || '?';
            var icon = cat.icon || '\uD83D\uDCC1';
            var count = cat.fileCount || 0;
            var size = cat.sizeKB || 0;
            var heat = cat.heatLevel || 1;
            var skills = cat.relatedSkills || [];
            var progress = (count / maxCount * 100);
            var cardId = 'kn-' + ld.tag + '-' + ci;
            
            // 指标数据
            var relatedTotal = skills.length + (cat.relatedMemories || []).length;
            var heatLabels = ['', '\u4f4e', '\u4f4e', '\u4e2d', '\u9ad8', '\u6781\u9ad8'];
            
            window.AppState.dataMap[cardId] = { name: name, icon: icon, level: Math.min(5, Math.ceil(count / 10)), description: (cat.description || name) + '\n\u6587\u6863\u6570: ' + count + (size ? ' | \u5927\u5c0f: ' + size + 'KB' : '') + (skills.length ? '\n\u5173\u8054\u6280\u80fd: ' + skills.join(', ') : '') + ((cat.relatedMemories || []).length ? '\n\u5173\u8054\u8bb0\u5fc6: ' + (cat.relatedMemories || []).join(', ') : ''), source: ld.label, callCount: count, frequency: heatLabels[Math.min(5, heat)] || '\u4f4e', successRate: relatedTotal > 0 ? '\u26A1' + skills.length + ' \uD83E\uDDE0' + (cat.relatedMemories || []).length : '0' };
            
            // Heat dots
            var heatHtml = '';
            for (var h = 0; h < 5; h++) { heatHtml += '<span class="kn-heat-dot' + (h < heat ? ' active' : '') + '" style="' + (h < heat ? 'background:' + ld.color + ';' : '') + '"></span>'; }
            
            // Related skills tags
            var tagsHtml = '';
            if (skills.length > 0) {
                tagsHtml = '<div class="kn-card-tags">';
                var showSkills = skills.slice(0, 3);
                for (var si = 0; si < showSkills.length; si++) { tagsHtml += '<span class="kn-skill-tag" style="border-color:' + ld.border + ';color:' + ld.color + ';">\u26A1 ' + showSkills[si] + '</span>'; }
                if (skills.length > 3) tagsHtml += '<span class="kn-skill-tag-more">+' + (skills.length - 3) + '</span>';
                tagsHtml += '</div>';
            }
            
            html += '<div class="kn-domain-card" style="--kn-color:' + ld.color + ';border-color:' + ld.border + ';" onmouseenter="showTreeTooltip(event,\'' + cardId + '\',\'knowledge\')" onmouseleave="hideTooltip()">';
            html += '<div class="kn-card-header"><span class="kn-card-icon">' + icon + '</span><div class="kn-card-info"><div class="kn-card-name">' + name + '</div><div class="kn-card-meta"><span class="kn-card-count" style="color:' + ld.color + ';">' + count + '</span> \u6587\u6863' + (size ? ' \u00b7 ' + size + 'KB' : '') + '</div></div><div class="kn-card-heat">' + heatHtml + '</div></div>';
            html += '<div class="kn-card-progress"><div class="kn-progress-fill" style="width:' + progress + '%;background:' + ld.color + ';"></div></div>';
            html += tagsHtml;
            html += '</div>';
        }
        
        html += '</div></div></div>';
        
        // Layer transition
        if (li < layerDef.length - 1) {
            var nextCats = layerCats[layerDef[li+1].tag];
            if (nextCats && nextCats.length > 0) {
                var transLabels = ['\u601d\u60f3\u6c89\u6dc0 \u2192 \u9886\u57df\u6df1\u5316', '\u9886\u57df\u77e5\u8bc6 \u2192 \u5b9e\u8df5\u6307\u5bfc'];
                html += '<div class="layer-transition"><div class="transition-line"></div><div class="transition-label">' + transLabels[li] + '</div><div class="transition-arrow">\u25BC</div></div>';
            }
        }
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ==================== 记忆树 - 纵向三层架构图（v3.0） ====================
function renderMemoryNeuralNetwork(container, memories) {
    if (!container) return;
    
    var tree = memories.tree;
    var total = memories.total || 0;
    
    // 记忆树四层定义 — 按 layerTag 稳定标识符匹配（不依赖中文 key）
    // v4.0: 增加系统约束层，确保所有记忆都能被正确展示
    var memLayerDef = [
        { layerTag: 'L1-meta', icon: '\uD83E\uDDE0', label: '元认知层', color: '#a78bfa', border: 'rgba(167,139,250,0.25)', bg: 'rgba(18,15,30,0.95)', desc: '用户身份、思维方法、做事方法', align: '↔ 元能力层 · 基座知识层' },
        { layerTag: 'L2-domain', icon: '\uD83C\uDFAF', label: '领域记忆层', color: '#8b5cf6', border: 'rgba(139,92,246,0.25)', bg: 'rgba(16,12,28,0.95)', desc: '特定领域的完整经验沉淀', align: '↔ 领域能力层 · 领域知识层' },
        { layerTag: 'L3-execution', icon: '\uD83D\uDEE0\uFE0F', label: '实践记忆层', color: '#4ade80', border: 'rgba(74,222,128,0.25)', bg: 'rgba(10,20,15,0.95)', desc: '具体领域的踩坑经验和项目知识', align: '↔ 执行技能层 · 实践知识层' },
        { layerTag: 'SYSTEM', icon: '\u2699\uFE0F', label: '系统约束层', color: '#64748b', border: 'rgba(100,116,139,0.25)', bg: 'rgba(14,16,20,0.95)', desc: '系统自动提取的背景约束', align: '↔ 自动化学习' }
    ];
    
    // 按 layerTag 匹配树数据
    var memTreeKeys = Object.keys(tree);
    function findMemLayerData(layerTag) {
        for (var i = 0; i < memTreeKeys.length; i++) {
            if (tree[memTreeKeys[i]].layerTag === layerTag) return tree[memTreeKeys[i]];
        }
        return null;
    }
    
    if (!tree || Object.keys(tree).length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);"><div style="font-size:48px;margin-bottom:10px;">\uD83E\uDDE0</div><div>\u8bb0\u5fc6\u603b\u6570\uff1a' + total + '</div></div>';
        return;
    }
    
    // 计算实际显示的层数（有数据的层）
    var visibleLayerCount = 0;
    for (var lci = 0; lci < memLayerDef.length; lci++) {
        var layerData = findMemLayerData(memLayerDef[lci].layerTag);
        if (layerData && layerData.count > 0) visibleLayerCount++;
    }
    
    var html = '<div class="memory-arch">';
    
    for (var li = 0; li < memLayerDef.length; li++) {
        var ld = memLayerDef[li];
        var layerInfo = findMemLayerData(ld.layerTag);
        if (!layerInfo || layerInfo.count === 0) continue;
        
        html += '<div class="mem-layer" style="border-color:' + ld.border + ';">';
        html += '<div class="mem-layer-label" style="border-bottom-color:' + ld.border + ';"><span class="mem-label-icon">' + ld.icon + '</span><span class="mem-label-text" style="color:' + ld.color + ';">' + ld.label + '</span><span class="mem-label-desc">' + ld.desc + '</span><span class="mem-label-align">' + ld.align + '</span><span class="mem-label-count" style="color:' + ld.color + ';">' + layerInfo.count + ' \u6761</span></div>';
        html += '<div class="mem-layer-content">';
        
        var children = layerInfo.children || {};
        var childKeys = Object.keys(children);
        
        html += '<div class="mem-cards-grid">';
        for (var ci = 0; ci < childKeys.length; ci++) {
            var childName = childKeys[ci];
            var child = children[childName];
            if (child.count === 0) continue;
            
            var cIcon = child.icon || '\uD83D\uDCC1';
            var cColor = child.color || ld.color;
            var cardId = 'mem-' + li + '-' + ci;
            var nodeId = 'mem-expand-' + li + '-' + ci;
            
            window.AppState.dataMap[cardId] = { name: childName, icon: cIcon, level: Math.min(5, Math.ceil(child.count / 5)), description: (child.description || childName) + '\n\u8bb0\u5fc6\u6570: ' + child.count, source: ld.label, callCount: child.count, frequency: child.count >= 10 ? '\u9ad8' : child.count >= 5 ? '\u4e2d' : '\u4f4e', successRate: child.count >= 10 ? '\u2605\u2605\u2605' : child.count >= 5 ? '\u2605\u2605' : '\u2605' };
            
            html += '<div class="mem-category-card" style="--mem-cat-color:' + cColor + ';border-color:' + ld.border + ';" onclick="toggleMemCategoryExpand(\'' + nodeId + '\')" onmouseenter="showTreeTooltip(event,\'' + cardId + '\',\'memory\')" onmouseleave="hideTooltip()">';
            html += '<div class="mem-cat-header"><span class="mem-cat-icon">' + cIcon + '</span><span class="mem-cat-name">' + childName + '</span><span class="mem-cat-count" style="color:' + cColor + ';">' + child.count + '</span><span class="mem-cat-toggle">\u25B6</span></div>';
            
            // Inline expandable items
            var items = child.items || [];
            if (items.length > 0) {
                html += '<div class="mem-cat-items" id="' + nodeId + '" style="display:none;">';
                var showCount = Math.min(8, items.length);
                for (var ii = 0; ii < showCount; ii++) {
                    var item = items[ii];
                    var itemId = 'mem-item-' + li + '-' + ci + '-' + ii;
                    var title = (item.title || '\u8bb0\u5fc6').substring(0, 18);
                    if (item.title && item.title.length > 18) title += '...';
                    window.AppState.dataMap[itemId] = { name: item.title || '\u8bb0\u5fc6', icon: item.icon || '\uD83D\uDCAD', level: item.importance || 3, description: item.description || '\u6682\u65e0\u63cf\u8ff0', source: childName, callCount: 1, frequency: item.importance >= 4 ? '\u9ad8' : item.importance >= 2 ? '\u4e2d' : '\u4f4e', successRate: item.importance >= 4 ? '\u2605\u2605\u2605' : item.importance >= 2 ? '\u2605\u2605' : '\u2605' };
                    html += '<div class="mem-item-chip" style="border-color:rgba(' + (cColor === '#38bdf8' ? '56,189,248' : cColor === '#a78bfa' ? '167,139,250' : cColor === '#dc2626' ? '220,38,38' : '200,220,240') + ',0.3);" onmouseenter="showTreeTooltip(event,\'' + itemId + '\',\'memory\')" onmouseleave="hideTooltip()"><span class="mem-item-icon">' + (item.icon || '\uD83D\uDCAD') + '</span><span class="mem-item-title">' + title + '</span></div>';
                }
                if (items.length > 8) html += '<div class="mem-item-more">+' + (items.length - 8) + ' \u6761</div>';
                html += '</div>';
            }
            
            html += '</div>';
        }
        html += '</div></div></div>';
        
        // Layer transition - 动态适应层数
        if (li < memLayerDef.length - 1) {
            var nextLayer = findMemLayerData(memLayerDef[li+1].layerTag);
            if (nextLayer && nextLayer.count > 0) {
                var transLabels = {
                    'L1-meta_L2-domain': '\u8ba4\u77e5\u6c89\u6dc0 \u2192 \u9886\u57df\u4e13\u7cbe',
                    'L2-domain_L3-execution': '\u9886\u57df\u7ecf\u9a8c \u2192 \u5b9e\u8df5\u6307\u5bfc',
                    'L3-execution_SYSTEM': '\u5b9e\u8df5\u7ecf\u9a8c \u2192 \u7cfb\u7edf\u7ea6\u675f',
                    'L1-meta_L3-execution': '\u8ba4\u77e5\u6c89\u6dc0 \u2192 \u5b9e\u8df5\u6307\u5bfc',
                    'L1-meta_SYSTEM': '\u8ba4\u77e5\u6c89\u6dc0 \u2192 \u7cfb\u7edf\u7ea6\u675f'
                };
                var transKey = ld.layerTag + '_' + memLayerDef[li+1].layerTag;
                var transLabel = transLabels[transKey] || '\u2193';
                html += '<div class="layer-transition"><div class="transition-line"></div><div class="transition-label">' + transLabel + '</div><div class="transition-arrow">\u25BC</div></div>';
            }
        }
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// Toggle memory category expand
function toggleMemCategoryExpand(nodeId) {
    var el = document.getElementById(nodeId);
    if (!el) return;
    var card = el.closest('.mem-category-card');
    var toggle = card ? card.querySelector('.mem-cat-toggle') : null;
    if (el.style.display === 'none') {
        el.style.display = 'flex';
        if (toggle) toggle.textContent = '\u25BC';
        if (card) card.classList.add('expanded');
    } else {
        el.style.display = 'none';
        if (toggle) toggle.textContent = '\u25B6';
        if (card) card.classList.remove('expanded');
    }
}
window.toggleMemCategoryExpand = toggleMemCategoryExpand;

// ==================== 导出到全局 ====================
window.renderSkillTechTree = renderSkillTechTree;
window.renderKnowledgeArchive = renderKnowledgeArchive;
window.renderMemoryNeuralNetwork = renderMemoryNeuralNetwork;

// ==================== L形折线连接器（从Demo复制） ====================
function drawElbowConnectors() {
    var body = document.querySelector('.engine-body');
    if (!body) return;
    
    // 移除旧的 SVG overlay
    var old = body.querySelector('.elbow-svg-overlay');
    if (old) old.remove();
    
    var bodyRect = body.getBoundingClientRect();
    var bw = bodyRect.width;
    var bh = bodyRect.height;
    
    // v13.0: 内功修炼已废弃，只需要绘制 闭关修炼 → 经验总结 的 L 形连接
    var biguan  = document.getElementById('node-biguan');
    var jingyan = document.getElementById('node-jingyan');
    
    if (!biguan || !jingyan) return;
    
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('elbow-svg-overlay');
    svg.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);
    svg.setAttribute('width', bw);
    svg.setAttribute('height', bh);
    
    // 坐标转换：相对于 engine-body
    function rel(el) {
        var r = el.getBoundingClientRect();
        return {
            left:   r.left   - bodyRect.left,
            right:  r.right  - bodyRect.left,
            top:    r.top    - bodyRect.top,
            bottom: r.bottom - bodyRect.top,
            cx:     (r.left + r.right)  / 2 - bodyRect.left,
            cy:     (r.top  + r.bottom) / 2 - bodyRect.top
        };
    }
    
    var b = rel(biguan);
    var j = rel(jingyan);
    
    // 右侧 gutter 位置
    var gx1 = Math.min(bw - 16, b.right + 20);
    
    // ---- 连接器: 闭关修炼 → 经验总结（驱动）----
    // 路径：右→下→左→下→右→射入经验总结（完整绕行路径）
    // 右侧gutter: gx1 = b.right + 20
    // 左侧gutter: gxLeft = j.left - 20
    // 中间折转高度: mid_y = 两行中间
    var gxLeft = j.left - 20;
    var midY = (b.cy + j.cy) / 2;
    var p1 = { sx: b.right, sy: b.cy, gxR: gx1, midY: midY, gxL: gxLeft, ex: j.left, ey: j.cy };
    
    var path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // 右出(b.right) → 向右到右侧gutter(gx1) → 向下到中间高度(midY)
    // → 向左横穿到左侧gutter(gxLeft) → 向下到经验总结中心(j.cy)
    // → 向右到箭头尾部(j.left-10)，箭头顶点接到j.left
    path1.setAttribute('d',
      'M ' + p1.sx + ' ' + p1.sy +
      ' L ' + p1.gxR + ' ' + p1.sy +
      ' L ' + p1.gxR + ' ' + p1.midY +
      ' L ' + p1.gxL + ' ' + p1.midY +
      ' L ' + p1.gxL + ' ' + p1.ey +
      ' L ' + (p1.ex - 10) + ' ' + p1.ey
    );
    path1.setAttribute('fill', 'none');
    path1.setAttribute('stroke', '#fb923c');
    path1.setAttribute('stroke-width', '1.5');
    path1.setAttribute('stroke-dasharray', '5, 4');
    path1.setAttribute('stroke-linecap', 'round');
    path1.setAttribute('stroke-linejoin', 'round');
    path1.setAttribute('opacity', '0.55');
    svg.appendChild(path1);
    
    // 箭头朝右 ► 射入经验总结：顶点(j.left, j.cy)，展开在左(j.left-10, j.cy±5)
    var arrow1 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow1.setAttribute('points', p1.ex + ',' + p1.ey + ' ' + (p1.ex - 10) + ',' + (p1.ey - 5) + ' ' + (p1.ex - 10) + ',' + (p1.ey + 5));
    arrow1.setAttribute('fill', '#fb923c');
    arrow1.setAttribute('opacity', '0.55');
    svg.appendChild(arrow1);
    
    // 标签 "驱动" — 放在右侧竖线右边（gxR+2），高度在右侧竖线中间（b.cy → midY 段）
    var foreignObj = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObj.setAttribute('x', p1.gxR + 2);
    // 标签在右侧竖线(b.cy → midY)的中间位置
    foreignObj.setAttribute('y', (p1.sy + p1.midY) / 2 - 12);
    foreignObj.setAttribute('width', '36');
    foreignObj.setAttribute('height', '24');
    var labelDiv = document.createElement('span');
    labelDiv.className = 'connector-label connector-label--center';
    labelDiv.style.cssText = '--label-color: rgba(251, 146, 60, 0.8); --label-border: rgba(251, 146, 60, 0.4); font-size: 9px; padding: 3px 6px; opacity: 0.75;';
    labelDiv.textContent = '驱动';
    foreignObj.appendChild(labelDiv);
    svg.appendChild(foreignObj);
    
    // v13.0: 内功修炼已废弃，移除 内功修炼→记忆优化 的连接器
    
    body.appendChild(svg);
}
window.drawElbowConnectors = drawElbowConnectors;

// ==================== 技能生命周期 U形闭环绘制 ====================
function drawLifecycleLoop() {
    var section = document.querySelector('.lifecycle-section');
    var flow = document.querySelector('.lifecycle-flow');
    if (!section || !flow) return;
    
    // 移除旧的 SVG
    var old = section.querySelector('.lifecycle-loop-svg');
    if (old) old.remove();
    
    var sectionRect = section.getBoundingClientRect();
    
    // 获取两个关键节点
    var findNode = document.getElementById('node-skill-find');
    var dojoNode = document.getElementById('node-skill-dojo');
    var label = flow.querySelector('.lifecycle-feedback-label');
    
    if (!findNode || !dojoNode) return;
    
    // 坐标转换：相对于 lifecycle-section
    function rel(el) {
        var r = el.getBoundingClientRect();
        return {
            left:   r.left   - sectionRect.left,
            right:  r.right  - sectionRect.left,
            top:    r.top    - sectionRect.top,
            bottom: r.bottom - sectionRect.top,
            cx:     (r.left + r.right)  / 2 - sectionRect.left,
            cy:     (r.top  + r.bottom) / 2 - sectionRect.top
        };
    }
    
    var f = rel(findNode);
    var d = rel(dojoNode);
    
    // U形闭环：从技能修炼右侧 → 向右 → 向下 → 向左 → 向上 → 技能发现左侧
    var loopBottom = Math.max(f.bottom, d.bottom) + 28;
    var loopRight = d.right + 20;
    var loopLeft = f.left - 20;
    var cornerRadius = 12;
    
    // SVG覆盖整个section加上延伸区域
    var svgWidth = sectionRect.width;
    var svgHeight = loopBottom + 10;
    
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('lifecycle-loop-svg');
    svg.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.style.top = '0';
    svg.style.left = '0';
    
    // 定义渐变
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.setAttribute('id', 'loopGradient');
    gradient.setAttribute('x1', '100%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '0%');
    
    var stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', 'rgba(56, 189, 248, 0.5)');
    gradient.appendChild(stop1);
    
    var stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'rgba(167, 139, 250, 0.5)');
    gradient.appendChild(stop2);
    
    defs.appendChild(gradient);
    svg.appendChild(defs);
    
    // U形路径
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    var pathD = 'M ' + d.right + ' ' + d.cy +
        ' L ' + (loopRight - cornerRadius) + ' ' + d.cy +
        ' Q ' + loopRight + ' ' + d.cy + ' ' + loopRight + ' ' + (d.cy + cornerRadius) +
        ' L ' + loopRight + ' ' + (loopBottom - cornerRadius) +
        ' Q ' + loopRight + ' ' + loopBottom + ' ' + (loopRight - cornerRadius) + ' ' + loopBottom +
        ' L ' + (loopLeft + cornerRadius) + ' ' + loopBottom +
        ' Q ' + loopLeft + ' ' + loopBottom + ' ' + loopLeft + ' ' + (loopBottom - cornerRadius) +
        ' L ' + loopLeft + ' ' + (f.cy + cornerRadius) +
        ' Q ' + loopLeft + ' ' + f.cy + ' ' + (loopLeft + cornerRadius) + ' ' + f.cy +
        ' L ' + (f.left - 8) + ' ' + f.cy;
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#loopGradient)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    
    // 箭头（指向右侧技能发现节点）
    var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    var arrowX = f.left - 8;
    arrow.setAttribute('points', (arrowX + 8) + ',' + f.cy + ' ' + arrowX + ',' + (f.cy - 5) + ' ' + arrowX + ',' + (f.cy + 5));
    arrow.setAttribute('fill', 'rgba(167, 139, 250, 0.6)');
    svg.appendChild(arrow);
    
    section.appendChild(svg);
    
    // 添加沿路径流动的能量粒子
    var pathLen = path.getTotalLength();
    if (pathLen > 0) {
        // 创建流动粒子1
        var particle1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        particle1.setAttribute('r', '4');
        particle1.setAttribute('fill', '#a78bfa');
        particle1.style.filter = 'drop-shadow(0 0 6px rgba(167,139,250,0.8))';
        // 使用 animateMotion 沿路径流动
        var motion1 = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        motion1.setAttribute('dur', '4s');
        motion1.setAttribute('repeatCount', 'indefinite');
        motion1.setAttribute('path', pathD);
        particle1.appendChild(motion1);
        svg.appendChild(particle1);
        
        // 创建流动粒子2（延迟2秒）
        var particle2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        particle2.setAttribute('r', '3');
        particle2.setAttribute('fill', '#38bdf8');
        particle2.style.filter = 'drop-shadow(0 0 5px rgba(56,189,248,0.7))';
        var motion2 = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
        motion2.setAttribute('dur', '4s');
        motion2.setAttribute('repeatCount', 'indefinite');
        motion2.setAttribute('begin', '2s');
        motion2.setAttribute('path', pathD);
        particle2.appendChild(motion2);
        svg.appendChild(particle2);
    }
    
    // 定位标签到底部中心
    if (label) {
        var flowRect = flow.getBoundingClientRect();
        var labelTop = loopBottom - (flowRect.top - sectionRect.top) - 2;
        label.style.top = labelTop + 'px';
        label.style.left = '50%';
        label.style.transform = 'translate(-50%, -50%)';
    }
}

// ==================== 技能调用关系连线（数据驱动，v2.0）====================
// 数据来源：character-data.json → skills.relationships.skill_calls
// 单一数据源在 scripts/constants.py 的 SKILL_CALL_RELATIONSHIPS
// 旧的硬编码 DOMAIN_SKILL_CALLS 已废弃，保留空数组做兼容兜底
window.DOMAIN_SKILL_CALLS = [];

// 从已加载的全局数据中读取 skill_calls（在 renderSkillTechTree() 中填充）
window.SKILL_CALL_DATA = [];

function drawSkillCallConnectors() {
    // 获取领域层和执行层容器
    var domainLayer = document.querySelector('.domain-layer');
    var execLayer = document.querySelector('.exec-layer');
    if (!domainLayer && !execLayer) return;
    
    // 移除旧的 SVG overlay
    var oldSvg = document.querySelector('.skill-call-svg-overlay');
    if (oldSvg) oldSvg.remove();
    
    // 找到技能架构容器作为 SVG 的父元素
    var skillArch = document.querySelector('.skill-architecture');
    if (!skillArch) return;
    
    var archRect = skillArch.getBoundingClientRect();
    
    // 创建 SVG overlay
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('skill-call-svg-overlay');
    svg.style.position = 'absolute';
    svg.style.top = '0';
    svg.style.left = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '10';
    svg.setAttribute('width', archRect.width);
    svg.setAttribute('height', archRect.height);
    svg.setAttribute('viewBox', '0 0 ' + archRect.width + ' ' + archRect.height);
    
    // 定义箭头标记
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    var colors = ['#8b5cf6', '#38bdf8', '#4ade80', '#fb923c', '#a78bfa'];
    colors.forEach(function(color) {
        var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrow-' + color.replace('#', ''));
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '7');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'strokeWidth');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M0,0 L0,6 L6,3 z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        defs.appendChild(marker);
    });
    svg.appendChild(defs);
    
    // 坐标转换函数
    function getRelPos(el) {
        var r = el.getBoundingClientRect();
        return {
            left: r.left - archRect.left,
            right: r.right - archRect.left,
            top: r.top - archRect.top,
            bottom: r.bottom - archRect.top,
            cx: (r.left + r.right) / 2 - archRect.left,
            cy: (r.top + r.bottom) / 2 - archRect.top,
            width: r.width,
            height: r.height
        };
    }
    
    // 绘制每条调用关系连线（数据来源：SKILL_CALL_DATA，从 JSON skill_calls 读取）
    var drawnPairs = {};
    var callsData = window.SKILL_CALL_DATA.length > 0 ? window.SKILL_CALL_DATA : window.DOMAIN_SKILL_CALLS;
    callsData.forEach(function(call) {
        var fromEl = skillArch.querySelector('[data-skill-name="' + call.from + '"]');
        var toEl = skillArch.querySelector('[data-skill-name="' + call.to + '"]');
        
        if (!fromEl || !toEl) return;
        
        // 防止重复绘制同一对连线
        var pairKey = call.from + '->' + call.to;
        if (drawnPairs[pairKey]) return;
        drawnPairs[pairKey] = true;
        
        var fromPos = getRelPos(fromEl);
        var toPos = getRelPos(toEl);
        
        // 确定连线起点和终点
        var startX, startY, endX, endY;
        var verticalDist = Math.abs(fromPos.cy - toPos.cy);
        var horizontalDist = Math.abs(fromPos.cx - toPos.cx);
        
        // 根据相对位置决定连线方向
        if (verticalDist > horizontalDist) {
            // 垂直方向为主
            if (fromPos.cy < toPos.cy) {
                // 从上到下
                startX = fromPos.cx;
                startY = fromPos.bottom;
                endX = toPos.cx;
                endY = toPos.top - 4;
            } else {
                // 从下到上
                startX = fromPos.cx;
                startY = fromPos.top;
                endX = toPos.cx;
                endY = toPos.bottom + 4;
            }
        } else {
            // 水平方向为主
            if (fromPos.cx < toPos.cx) {
                // 从左到右
                startX = fromPos.right;
                startY = fromPos.cy;
                endX = toPos.left - 4;
                endY = toPos.cy;
            } else {
                // 从右到左
                startX = fromPos.left;
                startY = fromPos.cy;
                endX = toPos.right + 4;
                endY = toPos.cy;
            }
        }
        
        // 创建曲线路径
        var midX = (startX + endX) / 2;
        var midY = (startY + endY) / 2;
        var pathD;
        
        if (verticalDist > horizontalDist * 1.5) {
            // 主要是垂直方向，使用 S 形曲线
            var ctrlY = startY + (endY - startY) * 0.5;
            pathD = 'M ' + startX + ' ' + startY + 
                    ' Q ' + startX + ' ' + ctrlY + ' ' + midX + ' ' + midY +
                    ' Q ' + endX + ' ' + ctrlY + ' ' + endX + ' ' + endY;
        } else if (horizontalDist > verticalDist * 1.5) {
            // 主要是水平方向，使用 S 形曲线
            var ctrlX = startX + (endX - startX) * 0.5;
            pathD = 'M ' + startX + ' ' + startY + 
                    ' Q ' + ctrlX + ' ' + startY + ' ' + midX + ' ' + midY +
                    ' Q ' + ctrlX + ' ' + endY + ' ' + endX + ' ' + endY;
        } else {
            // 对角线方向，使用二次贝塞尔曲线
            pathD = 'M ' + startX + ' ' + startY + 
                    ' Q ' + startX + ' ' + endY + ' ' + endX + ' ' + endY;
        }
        
        // 绘制路径
        var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', pathD);
        pathEl.setAttribute('fill', 'none');
        pathEl.setAttribute('stroke', call.color);
        pathEl.setAttribute('stroke-width', '1.5');
        pathEl.setAttribute('stroke-opacity', '0.6');
        pathEl.setAttribute('stroke-dasharray', '4,2');
        pathEl.setAttribute('marker-end', 'url(#arrow-' + call.color.replace('#', '') + ')');
        svg.appendChild(pathEl);
        
        // 添加标签（可选，只在足够长的线上显示）
        var lineLength = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        if (lineLength > 80 && call.label) {
            var labelEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            labelEl.setAttribute('x', midX);
            labelEl.setAttribute('y', midY - 4);
            labelEl.setAttribute('text-anchor', 'middle');
            labelEl.setAttribute('fill', call.color);
            labelEl.setAttribute('font-size', '10');
            labelEl.setAttribute('opacity', '0.7');
            labelEl.textContent = call.label;
            svg.appendChild(labelEl);
        }
    });
    
    // 添加到技能架构容器（需要设置 position: relative）
    skillArch.style.position = 'relative';
    skillArch.appendChild(svg);
}

window.drawSkillCallConnectors = drawSkillCallConnectors;

// 首页加载完成后绘制所有动态连线
window.addEventListener('load', function() {
    // 使用 requestIdleCallback 在空闲时绘制，避免阻塞首屏
    if ('requestIdleCallback' in window) {
        requestIdleCallback(function() {
            drawElbowConnectors();
            drawLifecycleLoop();
            drawSkillCallConnectors();
        }, { timeout: 1000 });
    } else {
        setTimeout(function() {
            drawElbowConnectors();
            drawLifecycleLoop();
            drawSkillCallConnectors();
        }, 600);
    }
});

// 防抖的 resize 处理器 - 性能优化版
let resizeRAF = null;
window.addEventListener('resize', function() {
    // 取消之前的重绘请求
    if (resizeRAF) {
        cancelAnimationFrame(resizeRAF);
    }
    
    clearTimeout(window.svgResizeTimer);
    window.svgResizeTimer = setTimeout(function() {
        // 使用 requestAnimationFrame 确保在渲染帧时执行
        resizeRAF = requestAnimationFrame(function() {
            drawElbowConnectors();
            drawLifecycleLoop();
            drawSkillCallConnectors();
        });
    }, 200); // 增加延迟到200ms
}, { passive: true });
window.drawLifecycleLoop = drawLifecycleLoop;
