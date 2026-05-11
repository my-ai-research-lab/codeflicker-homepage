/**
 * AI助手统一单页面 - 主应用脚本 v2.2
 * LINK Unified Single Page Application
 * 
 * 新版Tab结构：
 * 1. 了解我（自我介绍、价值主张、进化历程、成就墙）
 * 2. 我的作品
 * 3. 我的能力（技能树、记忆库、知识库、成长趋势）
 * 4. 我的日报
 */

// ==================== 共享常量（消除重复定义）====================
// 计算相对时间（全局工具函数，消除重复定义）
function getRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '今天更新';
    if (diff === 1) return '昨天更新';
    if (diff < 7) return `${diff}天前更新`;
    if (diff < 30) return `${Math.floor(diff / 7)}周前更新`;
    return `${Math.floor(diff / 30)}月前更新`;
}

const RARITY_LABELS = { 'common': '普通', 'rare': '稀有', 'epic': '史诗', 'legendary': '传说' };
const TREND_ICONS = { '技能': '⚡', '知识': '📚', '记忆': '🧠', '懂你': '🤝', '懂你程度': '🤝' };
// 计算记忆分类等级（全局工具函数，供多处复用）
function getMemoryLevel(count) {
    if (count >= 10) return 5;
    if (count >= 6) return 4;
    if (count >= 4) return 3;
    if (count >= 2) return 2;
    return 1;
}

const STATUS_MAP = {
    'deployed':    { cls: 'deployed',    text: '✅ 已上线' },
    'development': { cls: 'development', text: '🔧 开发中' },
    'archived':    { cls: 'archived',    text: '📦 已归档' }
};

// 归一化数据：将起始值设为基准100，显示相对增长百分比
function normalizeChartData(data) {
    if (!data || data.length === 0) return [];
    var baseValue = data[0] || 1;
    return data.map(function(v) { return Math.round((v / baseValue) * 100); });
}
// 计算实际变化值
function getChartChange(data) {
    if (!data || data.length < 2) return 0;
    return data[data.length - 1] - data[0];
}
// 项目状态文本
function getStatusInfo(status) {
    return STATUS_MAP[status] || STATUS_MAP['archived'];
}
// 质量徽章
function getQualityBadgeHtml(qualityLevel) {
    if (qualityLevel === 'featured') return '<span class="quality-badge featured">🏆 精选</span>';
    if (qualityLevel === 'excellent') return '<span class="quality-badge excellent">✨ 优秀</span>';
    return '';
}

// ==================== 全局状态 ====================
const AppState = {
    characterData: null,
    reportsData: null,
    projectsData: null,
    milestonesData: null,
    currentSection: 'about',  // 默认显示"了解我"Tab
    currentReportIndex: 0, // 当前选中的日报索引
    dataMap: {},
    sidebarStats: {},
    renderedSections: new Set(), // 已渲染的Section（懒渲染跟踪）
    loadingPromises: {}          // 数据加载Promise缓存
};

// ==================== Chart.js 按需加载 ====================
let _chartJSPromise = null;
function loadChartJS() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (_chartJSPromise) return _chartJSPromise;
    _chartJSPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Failed to load Chart.js'));
        document.head.appendChild(script);
    });
    return _chartJSPromise;
}

// 暴露到全局以便调试和inline事件处理
window.AppState = AppState;

// ==================== DOM 元素引用 ====================
const DOM = {
    tooltip: null,
    sections: {},
    navTabs: null
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    initNavigation();
    loadInitialData();
});

function initDOM() {
    DOM.tooltip = document.getElementById('tooltip');
    DOM.navTabs = document.querySelectorAll('.nav-tab');
    
    // 缓存所有section
    document.querySelectorAll('.content-section').forEach(section => {
        DOM.sections[section.id.replace('section-', '')] = section;
    });
    
    // 性能优化：滚动时禁用复杂效果
    initScrollOptimization();
}

// ==================== 滚动性能优化 ====================
function initScrollOptimization() {
    let scrollTimer = null;
    const body = document.body;
    
    // 滚动开始时添加标记类，禁用backdrop-filter等高开销效果
    window.addEventListener('scroll', function() {
        if (!body.classList.contains('is-scrolling')) {
            body.classList.add('is-scrolling');
        }
        
        // 停止滚动150ms后移除标记
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function() {
            body.classList.remove('is-scrolling');
        }, 150);
    }, { passive: true }); // 使用passive提升滚动性能
    
    // 使用 Intersection Observer 暂停视口外的动画
    if ('IntersectionObserver' in window) {
        const animationObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-viewport');
                } else {
                    entry.target.classList.remove('in-viewport');
                }
            });
        }, { rootMargin: '50px' });
        
        // 观察所有粒子元素
        document.querySelectorAll('.leaf-particle, .sheikah-spark').forEach(el => {
            animationObserver.observe(el);
        });
    }
}

function initNavigation() {
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const section = tab.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(sectionName) {
    // 更新导航状态
    DOM.navTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.section === sectionName);
    });
    
    // 更新内容区域
    Object.keys(DOM.sections).forEach(key => {
        DOM.sections[key].classList.toggle('active', key === sectionName);
    });
    
    AppState.currentSection = sectionName;
    
    // 懒渲染：首次切换到某个tab时触发渲染
    ensureSectionRendered(sectionName);
}

// 懒渲染：确保Section已加载数据并渲染
async function ensureSectionRendered(sectionName) {
    if (AppState.renderedSections.has(sectionName)) return;
    
    switch (sectionName) {
        case 'daily':
            await ensureReportsData();
            renderDailySection();
            AppState.renderedSections.add('daily');
            break;
        case 'works':
            // projectsData 已在初始加载中获取
            renderWorksSection();
            AppState.renderedSections.add('works');
            break;
        case 'abilities':
            await ensureReportsData(); // 图表需要reports数据，先加载
            renderAbilitiesSection();
            // 延迟渲染图表，确保canvas已在DOM中可见
            setTimeout(() => {
                renderAbilityRadarChart();
                renderTrendChart();
            }, 100);
            AppState.renderedSections.add('abilities');
            break;
    }
}

// 按需加载reports数据
function ensureReportsData() {
    if (AppState.reportsData && AppState.reportsData.trend) return Promise.resolve();
    if (AppState.loadingPromises.reports) return AppState.loadingPromises.reports;
    
    const t = Date.now();
    AppState.loadingPromises.reports = fetch(`./reports-data.json?t=${t}`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to load reports data');
            return res.json();
        })
        .then(data => {
            AppState.reportsData = data;
            // 更新侧边栏中依赖reports的部分
            updateSidebarWithReports();
        })
        .catch(e => console.error('Failed to load reports:', e));
    
    return AppState.loadingPromises.reports;
}

// reports数据加载后更新侧边栏
function updateSidebarWithReports() {
    const reports = AppState.reportsData?.reports || [];
    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate && reports.length > 0) {
        lastUpdate.textContent = reports[0].date;
    }
    // 渲染侧边栏迷你趋势图（依赖reportsData）
    loadChartJS().then(() => {
        renderMiniTrendChart();
    });
}

// ==================== 数据加载（分阶段） ====================
// Phase 1: 只加载首屏必需的数据（character + projects）
async function loadInitialData() {
    try {
        // 添加时间戳避免缓存
        const timestamp = Date.now();
        const [characterRes, projectsRes] = await Promise.all([
            fetch(`./character-data.json?t=${timestamp}`),
            fetch(`./projects-data.json?t=${timestamp}`)
        ]);
        
        if (!characterRes.ok) throw new Error('Failed to load character data: ' + characterRes.status);
        if (!projectsRes.ok) throw new Error('Failed to load projects data: ' + projectsRes.status);
        
        AppState.characterData = await characterRes.json();
        AppState.projectsData = await projectsRes.json();
        
        renderInitial();
        
        // Phase 2: 后台预加载其他数据（不阻塞首屏）
        requestIdleCallback ? requestIdleCallback(preloadDeferredData) : setTimeout(preloadDeferredData, 2000);
    } catch (e) {
        console.error('Failed to load initial data:', e);
        document.querySelectorAll('.loading').forEach(el => {
            el.textContent = '❌ 数据加载失败: ' + e.message;
        });
    }
}

// Phase 2: 后台预加载非首屏数据
function preloadDeferredData() {
    // 预加载reports数据（日报tab和一些图表需要）
    ensureReportsData();
    // 预加载milestones数据
    const t2 = Date.now();
    fetch(`./milestones-data.json?t=${t2}`).then(res => {
        if (res.ok) return res.json();
    }).then(data => {
        if (data) AppState.milestonesData = data;
        renderMilestones();
    }).catch(() => {});
    // 预加载evolution数据
    fetch(`./evolution-data.json?t=${t2}`).then(res => {
        if (res.ok) return res.json();
    }).then(data => {
        if (data) AppState.evolutionData = data;
        renderEvolutionTimeline();
    }).catch(() => {});
}

// 首屏渲染：只渲染当前可见的内容
function renderInitial() {
    renderSidebar();
    renderAboutSection();       // 了解我Section（首屏默认可见）
    AppState.renderedSections.add('about');
    
    // 渲染侧边栏雷达图（依赖characterData，已加载）
    loadChartJS().then(() => {
        renderRadarChart();
    });
    
}


// ==================== 了解我Section ====================
function renderAboutSection() {
    const char = AppState.characterData?.character;
    const skills = AppState.characterData?.skills;
    const knowledge = AppState.characterData?.knowledge;
    const memories = AppState.characterData?.memories;
    const projects = AppState.projectsData;
    const achievements = AppState.characterData?.achievements || [];
    
    if (!char || !skills || !knowledge) return;
    
    // 更新"了解我"页面的等级显示
    const aboutLevel = document.getElementById('about-level');
    if (aboutLevel) aboutLevel.textContent = 'LV.' + char.level;
    
    // 更新简介中的技能/记忆/知识统计（动态同源）
    const aboutSkillCount = document.getElementById('about-skill-count');
    const aboutMemoryCount = document.getElementById('about-memory-count');
    const aboutKnowledgeCount = document.getElementById('about-knowledge-count');
    if (aboutSkillCount) aboutSkillCount.textContent = (skills.total || 0) + '项技能';
    if (aboutMemoryCount) aboutMemoryCount.textContent = (memories?.total || 0) + '条记忆';
    if (aboutKnowledgeCount) aboutKnowledgeCount.textContent = (knowledge.totalFiles || 0) + '份知识文档';
    
    // 更新小无相功footer中的技能数（同源）
    const xiaowuxiangSkillCount = document.getElementById('xiaowuxiang-skill-count');
    if (xiaowuxiangSkillCount) xiaowuxiangSkillCount.textContent = (skills.total || 0) + ' 项技能';
    
    // 更新tagline中的等级显示（同源）
    const aboutTaglineLevel = document.getElementById('about-tagline-level');
    if (aboutTaglineLevel) aboutTaglineLevel.textContent = 'Lv.' + char.level + ' ' + (char.levelTitle || '');
    
    // 计算运行天数 — v2.0 从数据源读取诞生日（SSoT）
    const birthDateStr = char.birthDate || '2026-02-01';
    const firstDate = new Date(birthDateStr);
    const today = new Date();
    const runDays = Math.max(30, Math.floor((today - firstDate) / (1000 * 60 * 60 * 24)));
    
    // 渲染核心统计指标面板 — v3.0 四维能力展示（懂你+技能+沉淀+经验）
    renderAboutCoreStats({
        character: char,
        skills: skills,
        knowledge: knowledge,
        memories: memories,
        projects: projects,
        runDays: runDays,
        achievements: achievements
    });
    
    // 渲染成就墙（在了解我Section中）
    renderAchievements(achievements);
}

// 了解我 - 核心统计指标面板 v3.1（四维能力简洁版）
function renderAboutCoreStats(data) {
    const container = document.getElementById('about-stats');
    if (!container) return;
    
    const { character: char, skills, knowledge, memories, projects, runDays, achievements } = data;
    
    // 四维能力数据
    const stats = char?.stats || {};

    
    // 四维能力定义（v5.0: 优先从数据源读取，硬编码仅作为 fallback — SSoT）
    const injectedDims = char?.dimensionsMeta;
    const dimensions = (Array.isArray(injectedDims) && injectedDims.length > 0) ? injectedDims : [
        { key: 'understanding', icon: '🤝', name: '懂你程度', shortName: '懂你', color: '#00d4ff', desc: '越来越不用纠正' },
        { key: 'skillDepth', icon: '⚡', name: '技能深度', shortName: '技能', color: '#fbbf24', desc: '技能越来越厉害' },
        { key: 'quality', icon: '💎', name: '沉淀质量', shortName: '沉淀', color: '#a78bfa', desc: '越用越有沉淀' },
        { key: 'experience', icon: '🎯', name: '使用经验', shortName: '经验', color: '#4ade80', desc: '时间和广度积累' },
        { key: 'thinkingDepth', icon: '💭', name: '思考深度', shortName: '思考', color: '#f472b6', desc: '分析越来越深刻' }
    ];
    
    // 找出最弱维度
    let weakestDim = dimensions[0];
    dimensions.forEach(dim => {
        if ((stats[dim.key] || 0) < (stats[weakestDim.key] || 0)) {
            weakestDim = dim;
        }
    });
    
    // EXP总量
    const totalExp = char?.totalExp || 0;
    
    // 计算一些关键统计
    const totalSkills = skills?.total || 0;
    const totalKnowledge = knowledge?.totalFiles || 0;
    const totalMemories = memories?.total || 0;
    const totalProjects = projects?.summary?.total || 0;
    const deployedProjects = projects?.summary?.deployed || 0;
    const unlockedAchievements = (achievements || []).filter(a => a.unlocked).length;
    
    container.innerHTML = `
        <div class="about-stats-title">📊 四维能力</div>
        
        <!-- 四维能力横向条形图 -->
        <div class="dimension-bars-v2">
            ${dimensions.map(dim => {
                const score = stats[dim.key] || 0;
                const isWeakest = dim.key === weakestDim.key;
                return `
                    <div class="dim-row ${isWeakest ? 'weakest' : ''}">
                        <div class="dim-row-label">
                            <span class="dim-row-icon">${dim.icon}</span>
                            <span class="dim-row-name">${dim.name}</span>
                        </div>
                        <div class="dim-row-bar">
                            <div class="dim-row-fill" style="width: ${score}%; background: ${dim.color}"></div>
                        </div>
                        <span class="dim-row-score" style="color: ${dim.color}">${score.toFixed(0)}</span>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- 核心数据统计 -->
        <div class="about-stats-grid">
            <div class="stat-mini"><span class="stat-mini-icon">⚡</span><span class="stat-mini-value">${totalSkills}</span><span class="stat-mini-label">技能</span></div>
            <div class="stat-mini"><span class="stat-mini-icon">📚</span><span class="stat-mini-value">${totalKnowledge}</span><span class="stat-mini-label">知识</span></div>
            <div class="stat-mini"><span class="stat-mini-icon">🧠</span><span class="stat-mini-value">${totalMemories}</span><span class="stat-mini-label">记忆</span></div>
            <div class="stat-mini"><span class="stat-mini-icon">🎨</span><span class="stat-mini-value">${totalProjects}</span><span class="stat-mini-label">作品</span></div>
            <div class="stat-mini"><span class="stat-mini-icon">🏆</span><span class="stat-mini-value">${unlockedAchievements}</span><span class="stat-mini-label">成就</span></div>
            <div class="stat-mini"><span class="stat-mini-icon">📈</span><span class="stat-mini-value">${runDays}</span><span class="stat-mini-label">天</span></div>
        </div>
        
        <!-- 总分数和升级建议 -->
        <div class="exp-summary-v2">
            <div class="exp-total-v2">
                <span class="exp-label-v2">综合评分</span>
                <span class="exp-value-v2">${totalExp.toFixed(1)} / 100</span>
            </div>
            <div class="upgrade-hint-v2">
                💡 提升「${weakestDim.name}」最能加速升级
            </div>
        </div>
    `;
}

// 渲染段位进阶路径（用于hover气泡）
// v2.0 修复（2026-04-06 架构一致性）：TIER_SYSTEM 从 character-data.json 读取，
//      不再前端硬编码，单一数据源 = constants.py TIER_SYSTEM
function renderTierRoadmap(currentLevel) {
    // 优先从 character-data.json 注入的 allTiers 读取
    const injected = AppState.characterData?.character?.allTiers;
    const tiers = (Array.isArray(injected) && injected.length > 0) ? injected : [
        // Fallback（仅在数据未注入时使用，避免崩溃）
        { name: '青铜', minLevel: 1, maxLevel: 10, color: '#cd7f32', icon: '🥉', description: '刚起步，正在磨合' },
        { name: '白银', minLevel: 11, maxLevel: 20, color: '#c0c0c0', icon: '🥈', description: '建立默契，基本可靠' },
        { name: '黄金', minLevel: 21, maxLevel: 30, color: '#ffd700', icon: '🥇', description: '深度融合，默契伙伴' },
        { name: '铂金', minLevel: 31, maxLevel: 40, color: '#e5e4e2', icon: '💎', description: '融会贯通，稳定交付' },
        { name: '钻石', minLevel: 41, maxLevel: 50, color: '#b9f2ff', icon: '💠', description: '精通多域，自驱进化' },
        { name: '大师', minLevel: 51, maxLevel: 60, color: '#9370db', icon: '🏆', description: '独当一面，体系成熟' },
        { name: '宗师', minLevel: 61, maxLevel: 70, color: '#ff6347', icon: '👑', description: '炉火纯青，知行合一' },
        { name: '传说', minLevel: 71, maxLevel: 80, color: '#ff4500', icon: '🌟', description: '超越预期，创造价值' },
        { name: '神话', minLevel: 81, maxLevel: 100, color: '#ffd700', icon: '✨', description: '三千世界，万法皆通' }
    ];
    
    return tiers.map(tier => {
        const isActive = currentLevel >= tier.minLevel && currentLevel <= tier.maxLevel;
        const isPassed = currentLevel > tier.maxLevel;
        const statusClass = isActive ? 'active' : (isPassed ? 'passed' : 'future');
        const statusIcon = isPassed ? '✓' : (isActive ? '◆' : '○');
        
        // 根据状态设置颜色：已达成绿色，当前金色，未达成灰色
        let nameColor;
        if (isPassed) {
            nameColor = '#4ade80';  // 绿色
        } else if (isActive) {
            nameColor = '#ffd700';  // 金色
        } else {
            nameColor = 'rgba(200, 220, 240, 0.7)';  // 灰白色
        }
        
        return `
            <div class="tier-item ${statusClass}">
                <span class="tier-status">${statusIcon}</span>
                <span class="tier-icon">${tier.icon}</span>
                <span class="tier-name" style="color: ${nameColor}">${tier.name}</span>
                <span class="tier-range">Lv.${tier.minLevel}-${tier.maxLevel}</span>
            </div>
        `;
    }).join('');
}

// ==================== 侧边栏渲染 ====================
function renderSidebar() {
    const char = AppState.characterData?.character;
    const skills = AppState.characterData?.skills;
    const knowledge = AppState.characterData?.knowledge;
    const memories = AppState.characterData?.memories;
    const projects = AppState.projectsData;
    
    if (!char || !skills || !knowledge || !memories) {
        console.warn('Character data not fully loaded');
        return;
    }
    
    // 等级 - 同时更新所有显示等级的位置
    const levelTitle = char.levelTitle || '';
    const levelText = 'LV.' + char.level;
    const heroLevel = document.getElementById('hero-level');
    const aboutLevel = document.getElementById('about-level');
    if (heroLevel) heroLevel.textContent = levelText;
    if (aboutLevel) aboutLevel.textContent = levelText;
    
    // 更新等级称号
    const heroTitle = document.getElementById('hero-level-title');
    const aboutTitle = document.getElementById('about-level-title');
    if (heroTitle) heroTitle.textContent = levelTitle;
    if (aboutTitle) aboutTitle.textContent = levelTitle;
    
    // 渲染等级进度面板
    renderLevelProgress(char);
    
    // 核心数据
    const statSkills = document.getElementById('stat-skills');
    const statKnowledge = document.getElementById('stat-knowledge');
    const statMemory = document.getElementById('stat-memory');
    const statProjects = document.getElementById('stat-projects');
    
    if (statSkills) { statSkills.textContent = skills.total; statSkills.className = 'stat-value rarity-legendary'; }
    if (statKnowledge) { statKnowledge.textContent = knowledge.totalFiles; statKnowledge.className = 'stat-value rarity-epic'; }
    if (statMemory) { statMemory.textContent = memories.total; statMemory.className = 'stat-value rarity-rare'; }
    if (statProjects && projects?.summary) { statProjects.textContent = projects.summary.total; statProjects.className = 'stat-value rarity-common'; }
    // v4.4: 作品数量 — stat-works-count 也要赋值（之前遗漏）
    const statWorksCount = document.getElementById('stat-works-count');
    if (statWorksCount) { statWorksCount.textContent = char?.worksCount || projects?.summary?.total || 0; statWorksCount.className = 'stat-value rarity-common'; }
    
    // 存储侧边栏数据供气泡使用
    // v4.3: 从 knowledge.categories (后端实际字段) 提取目录列表（修复 directories 幽灵字段）
    const knowledgeCats = knowledge.categories || {};
    const directories = Object.entries(knowledgeCats).map(([name, info]) => ({ name: info.displayName || name, count: info.fileCount || 0 }));
    const categories = skills.categories || {};
    // v4.3: 后端实际字段是 byCategory（修复字段名不匹配）
    const memCategories = memories.byCategory || memories.categories || {};
    
    AppState.sidebarStats = {
        skills: {
            name: '技能',
            icon: '⚡',
            value: skills.total,
            description: `已掌握${skills.total}项技能，涵盖${Object.keys(categories).length}个类别`,
            categories: Object.entries(categories).map(([name, cat]) => `${name}(${cat.count})`).join('、')
        },
        knowledge: {
            name: '知识',
            icon: '📚',
            value: knowledge.totalFiles,
            description: `知识库包含${knowledge.totalFiles}个文件，分布在${directories.length}个目录`,
            categories: directories.map(d => `${d.name}(${d.count})`).join('、')
        },
        memory: {
            name: '记忆',
            icon: '🧠',
            value: memories.total,
            description: `存储${memories.total}条记忆，涵盖${Object.keys(memCategories).length}个分类`,
            categories: Object.entries(memCategories).map(([name, cat]) => `${name}(${cat.count})`).join('、')
        },
        projects: {
            name: '作品',
            icon: '🎨',
            value: projects?.summary?.total || 0,
            description: `完成${projects?.summary?.total || 0}个项目，其中${projects?.summary?.deployed || 0}个已部署`,
            categories: `已部署(${projects?.summary?.deployed || 0})、开发中(${projects?.summary?.inDevelopment || 0})`
        }
    };
    
    // 更新时间（reports可能还未加载，显示默认值）
    const lastUpdate = document.getElementById('last-update');
    const reports = AppState.reportsData?.reports || [];
    if (lastUpdate) {
        lastUpdate.textContent = reports.length > 0 ? reports[0].date : '加载中...';
    }
    
    // 迷你成就
    renderMiniAchievements();
}

// ==================== 等级进度面板渲染 ====================
function renderLevelProgress(char) {
    if (!char) return;
    
    const level = char.level || 1;
    const totalExp = char.totalExp || 0;
    const expProgress = char.expProgress || 0;
    
    // v5.0: 四维分数体系 — totalExp 是四维之和(0-100)，expProgress 是百分比
    
    // 更新等级显示
    const levelCurrent = document.getElementById('level-current');
    const levelNext = document.getElementById('level-next');
    const levelPercent = document.getElementById('level-percent');
    
    const levelTitle = char.levelTitle || '';
    if (levelCurrent) levelCurrent.textContent = 'LV.' + level;
    if (levelPercent) levelPercent.textContent = expProgress.toFixed(1) + '%';
    
    // 显示等级称号（带hover气泡显示进阶路径）
    const levelTitleEl = document.getElementById('level-title');
    if (levelTitleEl) {
        levelTitleEl.textContent = levelTitle;
        // 渲染进阶路径到气泡容器
        const tierPopup = document.getElementById('tier-popup');
        if (tierPopup) {
            tierPopup.innerHTML = `
                <div class="tier-popup-header">🏅 段位进阶路径</div>
                <div class="tier-popup-list">
                    ${renderTierRoadmap(level)}
                </div>
                <div class="tier-popup-footer">当前: Lv.${level}</div>
            `;
        }
    }
    
    // 更新经验条
    const expBarFill = document.getElementById('exp-bar-fill');
    if (expBarFill) {
        expBarFill.style.width = expProgress + '%';
        // 超过90%时添加金色脉冲效果
        if (expProgress >= 90) {
            expBarFill.classList.add('almost-full');
        } else {
            expBarFill.classList.remove('almost-full');
        }
    }
    
    // 更新经验文字
    const expCurrent = document.getElementById('exp-current');
    const expNeeded = document.getElementById('exp-needed');
    
    // v5.0: 四维分数展示，不再用「还需多少EXP」
    const debug = char.debug || {};
    const metrics = debug.metrics || {};
    if (expCurrent) {
        const u = metrics.understandingScore || 0;
        const d = metrics.depthScore || 0;
        const q = metrics.qualityScore || 0;
        const e = metrics.experienceScore || 0;
        expCurrent.textContent = `懂你${u}/30 + 深度${d}/25 + 质量${q}/20 + 经验${e}/25`;
    }
    
    if (expNeeded) {
        expNeeded.textContent = `总分 ${totalExp.toFixed(1)}/100 → Lv.${level}`;
        expNeeded.style.color = '';
    }
}

// ==================== 升级指南折叠控制 ====================
function toggleUpgradeGuide() {
    const content = document.getElementById('upgrade-guide-content');
    const toggle = document.getElementById('upgrade-toggle');
    
    if (content && toggle) {
        content.classList.toggle('show');
        toggle.classList.toggle('expanded');
    }
}

// 暴露到全局
window.toggleUpgradeGuide = toggleUpgradeGuide;

function renderMiniAchievements() {
    const achievements = AppState.characterData?.achievements || [];
    const container = document.getElementById('achievements-mini');
    if (!container) return;
    
    const unlocked = achievements.filter(a => a.unlocked).slice(0, 8);
    container.innerHTML = unlocked.map(a => `
        <div class="ach-mini-item" title="${a.name}: ${a.desc}">
            ${a.icon}
        </div>
    `).join('');
}

// ==================== 日报Section v7.1 ====================
function renderDailySection() {
    const reports = AppState.reportsData?.reports || [];
    if (reports.length === 0) {
        console.warn('No reports data available');
        return;
    }
    
    // 初始化日期选择器
    initDateSelector();
    
    // 渲染当前选中的日报
    renderSelectedReport(0);
}

function initDateSelector() {
    const reports = AppState.reportsData?.reports || [];
    const selector = document.getElementById('report-date-select');
    if (!selector || reports.length === 0) return;
    
    selector.innerHTML = reports.map((r, idx) => 
        `<option value="${idx}">${r.date} (${r.dayOfWeek})</option>`
    ).join('');
    
    selector.addEventListener('change', (e) => {
        const idx = parseInt(e.target.value);
        AppState.currentReportIndex = idx;
        renderSelectedReport(idx);
        updateTimelineActive(idx);
    });
}

function renderSelectedReport(index) {
    const reports = AppState.reportsData?.reports || [];
    if (index >= reports.length) return;
    const r = reports[index];
    const el = (id) => document.getElementById(id);

    // ===== 顶部状态 + 摘要条 =====
    const isAttention = (r.attention||[]).length > 0 || (r.pending||[]).length > 0;
    const badge = el('daily-status-badge');
    const dot = el('status-dot');
    const statusLabel = el('status-label');
    if (badge) { badge.className = 'daily-status-badge' + (isAttention?' attention':''); }
    if (dot)   { dot.className = 'status-dot' + (isAttention?' attention':''); }
    if (statusLabel) statusLabel.textContent = isAttention ? '需关注' : '运行平稳';

    const ss = r.summaryStats || {};
    if (el('stat-conversations')) el('stat-conversations').textContent = r.conversationCount || ss.conversations || 0;
    if (el('stat-deliveries'))   el('stat-deliveries').textContent = (r.deliveries||[]).length || ss.deliveries || 0;
    if (el('stat-projects'))     el('stat-projects').textContent = r.activeProjects || ss.projects || 0;
    const skDelta = r.skillChange || 0;
    if (el('stat-skill-delta'))  el('stat-skill-delta').textContent = skDelta > 0 ? '+'+skDelta : (skDelta < 0 ? skDelta : '±0');
    if (el('stat-skill-total'))  el('stat-skill-total').textContent = r.skillCount || '-';

    // ===== 需你关注 =====
    const attentionBody = el('attention-body');
    const attentionCount = el('attention-count');
    const attentionItems = r.attention || [];
    if (attentionBody) {
        attentionBody.innerHTML = attentionItems.length === 0
            ? '<div class="dc-ok">✅ 运行平稳，无需介入</div>'
            : attentionItems.map(a => `<div class="growth-item"><span class="growth-dim">⚠️</span><span class="growth-text">${escapeHtml(typeof a==='string'?a:(a.issue||a))}</span></div>`).join('');
    }
    if (attentionCount) attentionCount.textContent = attentionItems.length > 0 ? attentionItems.length+'项' : '';

    // ===== 今日计划 =====
    const planBody = el('plan-body');
    const plan = r.todayPlan || [];
    if (planBody) {
        planBody.innerHTML = plan.map(p =>
            `<div class="plan-item"><span class="plan-time">${escapeHtml(p.time||'')}</span><span class="plan-task">${escapeHtml(p.task||'')}</span></div>`
        ).join('') || '<span style="opacity:0.3;font-size:11px">暂无计划</span>';
    }

    // ===== 今日交付 =====
    const deliveryGrid = el('delivery-grid');
    const deliveriesCount = el('deliveries-count');
    const deliveries = r.deliveries || [];
    if (deliveriesCount) deliveriesCount.textContent = deliveries.length ? deliveries.length+'项' : '';
    if (deliveryGrid) {
        if (deliveries.length === 0) {
            deliveryGrid.innerHTML = '<div class="no-deliveries">暂无交付记录</div>';
        } else {
            deliveryGrid.innerHTML = deliveries.map(d => {
                const color = d.color || '#c9a84c';
                const result = d.result || (d.process ? (Array.isArray(d.process)?d.process.join('；'):d.process) : '');
                const tags = (d.tags||[]).slice(0,3);
                return `<div class="delivery-item" style="--dlv-color:${color}">
                    <div class="dlv-header">
                        <span class="dlv-icon">${d.icon||'📦'}</span>
                        <span class="dlv-type">${d.typeLabel||d.type||''}</span>
                    </div>
                    <div class="dlv-title">${escapeHtml(d.title||'')}</div>
                    ${result?`<div class="dlv-result">${escapeHtml(result)}</div>`:''}
                    ${tags.length?`<div class="dlv-tags">${tags.map(t=>`<span class="dlv-tag">${escapeHtml(t)}</span>`).join('')}</div>`:''}
                </div>`;
            }).join('');
        }
    }

    // ===== 进化数据 =====
    const mkChg = (c) => c > 0 ? '+'+c : (c < 0 ? ''+c : '');
    if (el('evo-skill-val')) el('evo-skill-val').textContent = r.skillCount || '-';
    if (el('evo-skill-chg')) el('evo-skill-chg').textContent = mkChg(r.skillChange||0);
    if (el('evo-know-val')) el('evo-know-val').textContent = r.knowledgeCount || '-';
    if (el('evo-know-chg')) el('evo-know-chg').textContent = mkChg(r.knowledgeChange||0);
    if (el('evo-mem-val')) el('evo-mem-val').textContent = r.memoryCount || '-';
    if (el('evo-mem-chg')) el('evo-mem-chg').textContent = mkChg(r.memoryChange||0);
    const evo = r.evoStats || {};
    if (el('evo-summary')) el('evo-summary').textContent = evo.summary || (skDelta?`新增${skDelta}个技能`:'持续运转中');

    // ===== 今日成长 =====
    const gt = r.growthToday || {};
    if (el('g-memory'))    el('g-memory').textContent    = gt.memory || '-';
    if (el('g-skill'))     el('g-skill').textContent     = gt.skill || '-';
    if (el('g-cognition')) el('g-cognition').textContent = gt.cognition || '-';
    if (el('g-workflow'))  el('g-workflow').textContent  = gt.workflow || '-';

    // ===== 今日洞察 =====
    const cl = r.communityLearning || {};
    if (el('insights-platform')) el('insights-platform').textContent = cl.platform || 'ClawBook';
    if (el('insight-tldr'))      el('insight-tldr').textContent = cl.tldr || ((r.highlights||[])[0]) || '-';
    const insights = cl.insights || r.highlights || [];
    if (el('insight-tags')) {
        el('insight-tags').innerHTML = insights.slice(0,4).map(i =>
            `<span class="insight-tag">💡 ${escapeHtml(typeof i==='string'?i:(i.text||i))}</span>`
        ).join('');
    }
}

// ========== v7.5: 板块一 - 核心进展 (分类显示 + 从capabilityGrowth补充能力提升) ==========
function renderCoreProgress(progress, capabilityGrowth) {
    const container = document.getElementById('core-progress-list');
    if (!container) return;
    
    // 分类整理进展项
    const deliveryItems = [];  // 交付情况
    const capabilityItems = []; // 能力提升
    
    // 从 coreProgress 数组中分类
    if (progress && progress.length > 0) {
        progress.forEach(item => {
            if (item.startsWith('💬') || item.startsWith('📁')) {
                deliveryItems.push(item);
            } else if (item.startsWith('⚡') || item.startsWith('🧠') || item.startsWith('📚')) {
                capabilityItems.push(item);
            } else {
                deliveryItems.push(item);
            }
        });
    }
    
    // 如果能力提升为空，从 capabilityGrowth 数据中补充
    if (capabilityItems.length === 0 && capabilityGrowth) {
        const skillChange = capabilityGrowth.skillChange || 0;
        const memoryChange = capabilityGrowth.memoryChange || 0;
        const knowledgeChange = capabilityGrowth.knowledgeChange || 0;
        
        // 技能变化
        if (skillChange > 0) {
            const newSkills = capabilityGrowth.newSkills || [];
            if (newSkills.length > 0) {
                const skillNames = newSkills.slice(0, 2).map(s => (s.name || s).replace('✨ ', '')).join('、');
                capabilityItems.push(`⚡ 新增 ${skillChange} 个技能: ${skillNames}${newSkills.length > 2 ? '...' : ''}`);
            } else {
                capabilityItems.push(`⚡ 技能库扩展 +${skillChange}`);
            }
        }
        
        // 记忆变化
        if (memoryChange > 0) {
            const newMemory = capabilityGrowth.newMemory || [];
            if (newMemory.length > 0) {
                const memTitles = newMemory.slice(0, 2).map(m => (m.title || m).replace(/^🆕\n?新增: |^🔄\n?更新: /g, '')).join('、');
                capabilityItems.push(`🧠 新增 ${memoryChange} 条记忆: ${memTitles}${newMemory.length > 2 ? '...' : ''}`);
            } else {
                capabilityItems.push(`🧠 记忆库强化 +${memoryChange}`);
            }
        }
        
        // 知识变化
        if (knowledgeChange > 0) {
            capabilityItems.push(`📚 知识库扩展 +${knowledgeChange} 篇文档`);
        }
    }
    
    let html = '';
    
    // 渲染交付情况分类
    if (deliveryItems.length > 0) {
        html += `
            <div class="progress-category">
                <div class="progress-category-header">
                    <span class="progress-category-icon">🚀</span>
                    <span class="progress-category-title">交付情况</span>
                </div>
                <div class="progress-items">
                    ${deliveryItems.map((item, idx) => renderProgressItem(item, idx + 1)).join('')}
                </div>
            </div>
        `;
    }
    
    // 渲染能力提升分类
    if (capabilityItems.length > 0) {
        html += `
            <div class="progress-category">
                <div class="progress-category-header">
                    <span class="progress-category-icon">📈</span>
                    <span class="progress-category-title">能力提升</span>
                </div>
                <div class="progress-items">
                    ${capabilityItems.map((item, idx) => renderProgressItem(item, idx + 1)).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html || '<div class="progress-empty">— 今日无进展记录</div>';
}

function renderProgressItem(item, index) {
    // 提取图标和文本
    let text = item;
    
    // 移除前缀图标
    const prefixes = ['💬 ', '📁 ', '⚡ ', '🧠 ', '📚 ', '✅ ', '— '];
    for (const prefix of prefixes) {
        if (text.startsWith(prefix)) {
            text = text.substring(prefix.length);
            break;
        }
    }
    
    // 分离主要内容和详细说明
    let mainText = text;
    let detailText = '';
    
    // 检查是否有“，”分隔的利好说明
    const benefitMatch = text.match(/^(.+?)，(.+)$/);
    if (benefitMatch) {
        mainText = benefitMatch[1];
        detailText = benefitMatch[2];
    }
    
    return `
        <div class="progress-item">
            <span class="progress-number">${index}.</span>
            <div class="progress-content">
                <div class="progress-main">${escapeHtml(mainText)}</div>
                ${detailText ? `<div class="progress-detail">→ ${escapeHtml(detailText)}</div>` : ''}
            </div>
        </div>
    `;
}

// ========== v7.1: 板块二 - 交付情况 ==========

// 渲染交付核心统计指标
function renderDeliveryStats(deliveries) {
    const container = document.getElementById('delivery-stats-bar');
    if (!container) return;
    
    if (!deliveries || deliveries.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = '';
    
    // 统计指标计算
    const totalDeliveries = deliveries.length;
    const conversations = deliveries.filter(d => d.type === 'conversation' || !d.type).length;
    const projects = deliveries.filter(d => d.type === 'project').length;
    
    // 统计所有交付物数量
    let totalDeliverables = 0;
    let totalCommits = 0;
    let totalFileChanges = 0;
    let totalDeploys = 0;
    
    deliveries.forEach(d => {
        if (d.deliverables) totalDeliverables += d.deliverables.length;
        if (d.commitCount) totalCommits += d.commitCount;
        if (d.fileChangeCount) totalFileChanges += d.fileChangeCount;
        if (d.deployUrl) totalDeploys++;
    });
    
    // 统计执行步骤数
    let totalSteps = 0;
    deliveries.forEach(d => {
        if (d.process) totalSteps += d.process.length;
    });
    
    const stats = [
        { icon: '📋', value: totalDeliveries, label: '总任务数' },
        { icon: '💬', value: conversations, label: '对话任务' },
        { icon: '📁', value: projects, label: '项目交付' },
        { icon: '📦', value: totalDeliverables, label: '交付物' },
    ];
    
    // 只在有数据时显示
    if (totalCommits > 0) stats.push({ icon: '💾', value: totalCommits, label: '代码提交' });
    if (totalFileChanges > 0) stats.push({ icon: '📝', value: totalFileChanges, label: '文件变更' });
    if (totalDeploys > 0) stats.push({ icon: '🚀', value: totalDeploys, label: '线上部署' });
    if (totalSteps > 0) stats.push({ icon: '⚙️', value: totalSteps, label: '执行步骤' });
    
    container.innerHTML = stats.map(s => `
        <div class="delivery-stat-item">
            <div class="delivery-stat-icon">${s.icon}</div>
            <div class="delivery-stat-value">${s.value}</div>
            <div class="delivery-stat-label">${s.label}</div>
        </div>
    `).join('');
}

function renderDeliveries(deliveries) {
    const container = document.getElementById('deliveries-list');
    if (!container) return;
    
    if (!deliveries || deliveries.length === 0) {
        container.innerHTML = '<div class="delivery-card"><div class="delivery-title">— 今日无交付记录</div></div>';
        return;
    }
    
    container.innerHTML = deliveries.map(d => {
        const type = d.type || 'conversation';
        const typeIcon = type === 'project' ? '📁' : '💬';
        const typeLabel = type === 'project' ? '项目' : '任务';
        
        // 交付物渲染
        let deliverablesHtml = '';
        if (d.deliverables && d.deliverables.length > 0) {
            deliverablesHtml = `
                <div class="delivery-deliverables">
                    ${d.deliverables.map(item => {
                        if (item.url) {
                            return `<span class="deliverable-item has-link"><a href="${item.url}" target="_blank">📦 ${escapeHtml(item.name)}</a></span>`;
                        }
                        return `<span class="deliverable-item">📦 ${escapeHtml(item.name)}</span>`;
                    }).join('')}
                </div>
            `;
        }
        
        // 执行过程渲染
        let processHtml = '';
        if (d.process && d.process.length > 0) {
            processHtml = `
                <div class="delivery-process">
                    ${d.process.map(step => `<div class="process-step">${escapeHtml(step)}</div>`).join('')}
                </div>
            `;
        }
        
        // 项目统计
        let statsHtml = '';
        if (type === 'project') {
            const stats = [];
            if (d.commitCount) stats.push(`${d.commitCount}次提交`);
            if (d.fileChangeCount) stats.push(`${d.fileChangeCount}个文件`);
            if (d.deployUrl) stats.push(`<a href="${d.deployUrl}" target="_blank" class="project-deploy-link">🔗 访问</a>`);
            if (stats.length > 0) {
                statsHtml = `<div style="margin-top: 8px; font-size: 12px; color: var(--zelda-brown);">${stats.join(' · ')}</div>`;
            }
        }
        
        return `
            <div class="delivery-card ${type}">
                <div class="delivery-header">
                    <div class="delivery-title">
                        ${typeIcon} ${escapeHtml(d.title)}
                    </div>
                    <span class="delivery-type-badge ${type}">${typeLabel}</span>
                </div>
                ${d.goal ? `
                    <div class="delivery-goal">
                        <span class="delivery-goal-icon">🎯</span>
                        <span class="delivery-goal-text">${escapeHtml(d.goal)}</span>
                    </div>
                ` : ''}
                ${deliverablesHtml}
                ${processHtml}
                ${statsHtml}
            </div>
        `;
    }).join('');
}

// ========== 每日修炼 8块结构渲染 ==========
function renderCapabilityGrowth(capData) {
    const r = capData;

    // B1: 需你关注
    const attentionContent = document.getElementById('attention-content');
    const attentionBadge = document.getElementById('attention-badge');
    const attention = r.attention || [];
    if (attentionContent) {
        if (attention.length === 0) {
            attentionContent.innerHTML = '<span class="cult-ok">✅ 运行平稳</span>';
        } else {
            attentionBadge && (attentionBadge.textContent = attention.length + '条');
            attentionContent.innerHTML = attention.map(a =>
                `<div class="cult-stat-row"><span>${escapeHtml(typeof a === 'string' ? a : (a.issue || a))}</span></div>`
            ).join('');
        }
    }

    // B3: 技能分析
    const sa = r.skillAnalysis || {};
    const el = (id) => document.getElementById(id);
    if (el('skill-call-count')) el('skill-call-count').textContent = sa.callCount || r.conversationCount || '-';
    if (el('skill-new-count')) el('skill-new-count').textContent = sa.newSkills > 0 ? '+' + sa.newSkills : (sa.newSkills === 0 ? '无新增' : '-');
    if (el('skill-health')) el('skill-health').textContent = sa.healthNote || '正常';

    // B4: 自进化统计
    if (el('evo-skill-val')) el('evo-skill-val').textContent = r.skillCount || '-';
    if (el('evo-skill-chg')) { const c = r.skillChange||0; el('evo-skill-chg').textContent = c > 0 ? '+'+c : (c < 0 ? c : ''); }
    if (el('evo-know-val')) el('evo-know-val').textContent = r.knowledgeCount || '-';
    if (el('evo-know-chg')) { const c = r.knowledgeChange||0; el('evo-know-chg').textContent = c > 0 ? '+'+c : (c < 0 ? c : ''); }
    if (el('evo-mem-val')) el('evo-mem-val').textContent = r.memoryCount || '-';
    if (el('evo-mem-chg')) { const c = r.memoryChange||0; el('evo-mem-chg').textContent = c > 0 ? '+'+c : (c < 0 ? c : ''); }
    const evo = r.evoStats || {};
    if (el('evo-summary')) el('evo-summary').textContent = evo.summary || (r.skillChange||r.knowledgeChange||r.memoryChange ? '有新增沉淀' : '持续运转中');

    // B5: 社区学习
    const cl = r.communityLearning || {};
    if (el('community-platform')) el('community-platform').textContent = cl.platform || 'ClawBook';
    const insights = cl.insights || r.highlights || [];
    if (el('community-insights')) {
        el('community-insights').innerHTML = insights.length > 0
            ? insights.map(i => `<div class="cult-insight-tag">💡 ${escapeHtml(typeof i === 'string' ? i : i.text||i)}</div>`).join('')
            : '<span class="cult-ok" style="opacity:0.5">暂无社区互动记录</span>';
    }

    // B6: 今日成长
    const gt = r.growthToday || {};
    if (el('growth-memory')) el('growth-memory').textContent = gt.memory || '-';
    if (el('growth-skill')) el('growth-skill').textContent = gt.skill || '-';
    if (el('growth-cognition')) el('growth-cognition').textContent = gt.cognition || '-';
    if (el('growth-workflow')) el('growth-workflow').textContent = gt.workflow || '-';

    // B7: 待解决
    const pending = r.pending || [];
    const pendingBadge = el('pending-badge');
    const pendingList = el('pending-list');
    if (pendingList) {
        if (pending.length === 0) {
            pendingList.innerHTML = '<span class="cult-ok">✅ 无阻塞事项</span>';
            pendingBadge && (pendingBadge.textContent = '');
        } else {
            pendingBadge && (pendingBadge.textContent = pending.length + '项');
            pendingList.innerHTML = pending.map(p => {
                const txt = typeof p === 'string' ? p : (p.issue || p.text || JSON.stringify(p));
                const impact = typeof p === 'object' ? (p.impact || '') : '';
                return `<div class="cult-pending-item">${impact ? `<span class="cult-pending-impact">${escapeHtml(impact)}</span>` : ''}${escapeHtml(txt)}</div>`;
            }).join('');
        }
    }

    // B8: 今日计划
    const plan = r.todayPlan || [];
    if (el('plan-list')) {
        el('plan-list').innerHTML = plan.length > 0
            ? plan.map(p => `<div class="cult-plan-item"><span class="cult-plan-time">${escapeHtml(p.time||'')}</span><span class="cult-plan-task">${escapeHtml(p.task||'')}</span></div>`).join('')
            : '<span style="opacity:0.4;font-size:11px">暂无计划</span>';
    }
}

function updateCapChangeV2(elementId, change) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (change > 0) {
        el.textContent = '+' + change;
        el.className = 'cap-change-v2 positive';
    } else if (change < 0) {
        el.textContent = change.toString();
        el.className = 'cap-change-v2 negative';
    } else if (change === 0) {
        el.textContent = '±0';
        el.className = 'cap-change-v2 neutral';
    } else {
        el.textContent = '-';
        el.className = 'cap-change-v2 neutral';
    }
}

function renderNewItemsTags(capData) {
    const container = document.getElementById('new-items-tags');
    if (!container) return;
    
    let tags = [];
    
    // 新增技能
    const newSkills = capData.newSkills || [];
    newSkills.forEach(s => {
        tags.push(`<span class="new-item-tag skill">⚡ ${escapeHtml(s.name)}</span>`);
    });
    
    // 新增知识
    const newKnowledge = capData.newKnowledge || [];
    newKnowledge.slice(0, 3).forEach(k => {
        const name = typeof k === 'string' ? k : (k.name || k.title || '未命名');
        tags.push(`<span class="new-item-tag knowledge">📚 ${escapeHtml(name)}</span>`);
    });
    
    // 新增记忆
    const newMemory = capData.newMemory || [];
    newMemory.slice(0, 3).forEach(m => {
        const title = typeof m === 'string' ? m : (m.title || '未命名');
        tags.push(`<span class="new-item-tag memory">🧠 ${escapeHtml(title)}</span>`);
    });
    
    if (tags.length === 0) {
        container.innerHTML = '<span style="font-size: 12px; color: var(--zelda-brown); opacity: 0.6;">今日无新增内容</span>';
    } else {
        container.innerHTML = tags.join('');
    }
}

// ========== v7.5: 趋势图（归一化显示，让成长更明显）==========
let dailyTrendChartInstance = null;

function renderDailyTrendChart() {
    if (!window.Chart) {
        loadChartJS().then(() => renderDailyTrendChart());
        return;
    }
    const canvas = document.getElementById('dailyTrendChart');
    if (!canvas) return;
    
    const trend = AppState.reportsData?.trend;
    if (!trend || !trend.dates || trend.dates.length === 0) {
        return;
    }
    
    // 销毁旧实例
    if (dailyTrendChartInstance) {
        dailyTrendChartInstance.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    
    const skillsNorm = normalizeChartData(trend.skills);
    const knowledgeNorm = normalizeChartData(trend.knowledge);
    const memoryNorm = normalizeChartData(trend.memory);
    const understandingNorm = normalizeChartData(trend.understanding || trend.memory);
    
    const skillChange = getChartChange(trend.skills);
    const knowledgeChange = getChartChange(trend.knowledge);
    const memoryChange = getChartChange(trend.memory);
    const understandingChange = getChartChange(trend.understanding || trend.memory);
    
    dailyTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trend.dates,
            datasets: [
                {
                    label: `懂你 (${understandingChange >= 0 ? '+' : ''}${understandingChange})`,
                    data: understandingNorm,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#00d4ff',
                    borderWidth: 2,
                    originalData: trend.understanding || trend.memory
                },
                {
                    label: `技能 (${skillChange >= 0 ? '+' : ''}${skillChange})`,
                    data: skillsNorm,
                    borderColor: '#0891b2',
                    backgroundColor: 'rgba(8, 145, 178, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#0891b2',
                    borderWidth: 2,
                    originalData: trend.skills
                },
                {
                    label: `知识 (${knowledgeChange >= 0 ? '+' : ''}${knowledgeChange})`,
                    data: knowledgeNorm,
                    borderColor: '#c9a227',
                    backgroundColor: 'rgba(201, 162, 39, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#c9a227',
                    borderWidth: 2,
                    originalData: trend.knowledge
                },
                {
                    label: `记忆 (${memoryChange >= 0 ? '+' : ''}${memoryChange})`,
                    data: memoryNorm,
                    borderColor: '#9b59b6',
                    backgroundColor: 'rgba(155, 89, 182, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointRadius: 4,
                    pointBackgroundColor: '#9b59b6',
                    borderWidth: 2,
                    originalData: trend.memory
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#8cb4c0',
                        font: { size: 11 },
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(30, 35, 40, 0.95)',
                    titleColor: '#00d4ff',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyColor: '#e8dcc4',
                    bodyFont: { size: 12 },
                    borderColor: '#00d4ff',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        title: function(context) {
                            return '📅 ' + context[0].label;
                        },
                        label: function(context) {
                            const labelParts = context.dataset.label.split(' ');
                            const label = labelParts[0]; // 只取"技能"、"知识"、"记忆"
                            const normValue = context.parsed.y;
                            // 获取原始值
                            const originalData = context.dataset.originalData;
                            const actualValue = originalData ? originalData[context.dataIndex] : normValue;
                            const growthPercent = normValue - 100;
                            const growthStr = growthPercent > 0 ? `+${growthPercent}%` : (growthPercent < 0 ? `${growthPercent}%` : '—');
                            return ` ${TREND_ICONS[label] || ''} ${label}: ${actualValue} (${growthStr})`;
                        }
                    }
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
                x: {
                    grid: { color: 'rgba(140, 180, 192, 0.1)' },
                    ticks: { color: '#8cb4c0', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(140, 180, 192, 0.1)' },
                    ticks: { 
                        color: '#8cb4c0', 
                        font: { size: 10 },
                        callback: function(value) {
                            // 显示为相对增长率
                            if (value === 100) return '基准';
                            return (value > 100 ? '+' : '') + (value - 100) + '%';
                        }
                    },
                    // 动态计算Y轴范围，让变化更明显
                    suggestedMin: 95,
                    suggestedMax: Math.max(...skillsNorm, ...knowledgeNorm, ...memoryNorm) + 5
                }
            }
        }
    });
}

// HTML转义工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTrendText(report) {
    const total = (report.skillChange || 0) + (report.knowledgeChange || 0) + (report.memoryChange || 0);
    if (total > 5) return '🚀 高速成长';
    if (total > 0) return '📈 稳步提升';
    return '— 稳定运行';
}


function selectReport(idx) {
    AppState.currentReportIndex = idx;
    renderSelectedReport(idx);
    
    // 更新下拉选择器
    const selector = document.getElementById('report-date-select');
    if (selector) selector.value = idx;
}

// 暴露到全局
window.selectReport = selectReport;

function formatChange(change) {
    if (change > 0) return { text: '+' + change, class: 'up' };
    if (change < 0) return { text: change.toString(), class: 'down' };
    return { text: '-', class: 'none' };
}

// ==================== 我的作品Section v2.0 (按分类二级Tab) ====================
let currentWorksTab = 'all';

function renderWorksSection() {
    const projects = AppState.projectsData;
    
    if (!projects?.summary) {
        console.warn('Projects data not available');
        return;
    }
    
    // 更新顶部统计
    const worksTotal = document.getElementById('works-total');
    const worksDeployed = document.getElementById('works-deployed');
    const worksFeatured = document.getElementById('works-featured');
    const worksTotalInline = document.getElementById('works-total-inline');
    const worksDeployedInline = document.getElementById('works-deployed-inline');
    const worksFeaturedInline = document.getElementById('works-featured-inline');
    
    if (worksTotal) worksTotal.textContent = projects.summary.total;
    if (worksDeployed) worksDeployed.textContent = projects.summary.deployed;
    if (worksFeatured) worksFeatured.textContent = projects.summary.featured || 0;
    if (worksTotalInline) worksTotalInline.textContent = projects.summary.total;
    if (worksDeployedInline) worksDeployedInline.textContent = projects.summary.deployed;
    if (worksFeaturedInline) worksFeaturedInline.textContent = projects.summary.featured || 0;
    
    // 更新分类Tab计数
    const categories = projects.categories || {};
    for (const [catId, catInfo] of Object.entries(categories)) {
        const countEl = document.getElementById('works-count-' + catId);
        if (countEl) countEl.textContent = catInfo.count || 0;
    }
    
    // 渲染当前选中的Tab内容
    renderWorksByCategory(projects, currentWorksTab);
}

// 按分类渲染作品
function renderWorksByCategory(projects, category) {
    const container = document.getElementById('works-list');
    if (!container) return;
    
    if (!projects?.projects || projects.projects.length === 0) {
        container.innerHTML = '<div class="no-data">暂无作品数据</div>';
        return;
    }
    
    let allProjects = projects.projects;
    
    // 过滤分类
    if (category !== 'all') {
        allProjects = allProjects.filter(p => p.category === category);
    }
    
    if (allProjects.length === 0) {
        container.innerHTML = '<div class="no-data">该分类暂无作品</div>';
        return;
    }
    
    // 精选项目排前
    allProjects = [...allProjects].sort((a, b) => {
        const aFeatured = a.quality?.level === 'featured' ? 1 : 0;
        const bFeatured = b.quality?.level === 'featured' ? 1 : 0;
        return bFeatured - aFeatured;
    });
    
    // 将项目数据存入dataMap供tooltip使用
    allProjects.forEach((p, idx) => {
        const projectId = 'project-' + idx;
        AppState.dataMap[projectId] = { ...p, type: 'project' };
    });
    
    
    // 生成作品卡片网格
    const cardsHtml = allProjects.map((p, idx) => {
        const projectId = 'project-' + idx;
        const si = getStatusInfo(p.status);
        const statusClass = si.cls;
        const statusText = si.text;
        const quality = p.quality || {};
        const qualityLevel = quality.level || 'basic';
        const qualityBadgeHtml = getQualityBadgeHtml(qualityLevel);
        const relativeTime = getRelativeTime(p.completedAt);
        const updateTimeHtml = relativeTime ? `<span class="work-update-time">${relativeTime}</span>` : '';
        const linkHtml = p.url ? `<a href="${p.url}" target="_blank" class="work-link">🔗 访问</a>` : '';
        
        return `
            <div class="work-card-mini ${statusClass} ${qualityLevel === 'featured' ? 'featured' : ''}" 
                 onmouseenter="showProjectTooltip(event, '${projectId}')" 
                 onmouseleave="hideTooltip()">
                ${qualityBadgeHtml}
                <div class="work-card-content">
                    <span class="work-icon-mini">${p.icon}</span>
                    <div class="work-info-mini">
                        <div class="work-name-mini">${p.name}</div>
                        <div class="work-meta-mini">
                            <span class="work-status-mini ${statusClass}">${statusText}</span>
                            ${updateTimeHtml}
                        </div>
                    </div>
                    ${linkHtml}
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `<div class="works-cards-grid">${cardsHtml}</div>`;
}

// 作品分类Tab切换
function switchWorksTab(category) {
    currentWorksTab = category;

    
    // 更新Tab按钮状态
    document.querySelectorAll('.works-category-btn').forEach(btn => {
        const isActive = btn.getAttribute('data-works-tab') === category;
        btn.classList.toggle('active', isActive);
    });
    
    // 重新渲染作品
    const projects = AppState.projectsData;
    if (projects) {
        renderWorksByCategory(projects, category);
    } else {
        console.warn('No projects data available for switchWorksTab');
    }
}
window.switchWorksTab = switchWorksTab;

// P0/P1优化: 作品树形分类展示
function renderWorksTree(projects) {
    const container = document.getElementById('works-list');
    
    if (!container) {
        console.warn('works-list container not found');
        return;
    }
    
    if (!projects?.projects || projects.projects.length === 0) {
        container.innerHTML = '<div class="no-data">暂无作品数据</div>';
        return;
    }
    
    const allProjects = projects.projects;
    
    // 将项目数据存入dataMap供tooltip使用
    allProjects.forEach((p, idx) => {
        const projectId = 'project-' + idx;
        AppState.dataMap[projectId] = {
            ...p,
            type: 'project'
        };
    });
    
    // 按分类分组
    const categories = projects.categories || {};
    const grouped = {};
    
    allProjects.forEach(p => {
        const cat = p.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
    });
    
    // 分类顺序和配置（v4.2: 优先从 projects-data.json 读取，硬编码仅作 fallback — SSoT）
    const dataCats = AppState.projectsData?.categories || {};
    const categoryOrder = Object.keys(dataCats).length > 0 
        ? Object.keys(dataCats) 
        : ['research', 'tools', 'docs', 'homepage'];
    const categoryConfig = {};
    for (const [k, v] of Object.entries(dataCats)) {
        categoryConfig[k] = { name: `${v.icon || '📁'} ${v.name}`, color: v.color || '#64748b', desc: v.description || v.name };
    }
    // fallback: 补齐缺失的分类
    const defaultCats = {
        'research': { name: '🔬 调研类', color: '#a78bfa', desc: '深度调研与分析报告' },
        'tools': { name: '🛠️ 工具类', color: '#4ade80', desc: '自动化工具与平台' },
        'docs': { name: '📄 文档类', color: '#fbbf24', desc: '知识沉淀与文档' },
        'homepage': { name: '📦 其他', color: '#64748b', desc: '其他项目' }
    };
    for (const [k, v] of Object.entries(defaultCats)) {
        if (!categoryConfig[k]) categoryConfig[k] = v;
    }
    
    
    // 生成单个项目卡片
    const renderProjectCard = (p, idx) => {
        const projectId = 'project-' + idx;
        const si = getStatusInfo(p.status);
        const statusClass = si.cls;
        const statusText = si.text;
        
        const quality = p.quality || {};
        const qualityLevel = quality.level || 'basic';
        
        // 精选/优秀标记
        let qualityBadgeHtml = getQualityBadgeHtml(qualityLevel);
        
        // P1: 最近更新时间
        const relativeTime = getRelativeTime(p.completedAt);
        const updateTimeHtml = relativeTime ? `<span class="work-update-time">${relativeTime}</span>` : '';
        
        const linkHtml = p.url 
            ? `<a href="${p.url}" target="_blank" class="work-link">🔗 访问</a>`
            : '';
        
        return `
            <div class="work-card-mini ${statusClass} ${qualityLevel === 'featured' ? 'featured' : ''}" 
                 onmouseenter="showProjectTooltip(event, '${projectId}')" 
                 onmouseleave="hideTooltip()">
                ${qualityBadgeHtml}
                <div class="work-card-content">
                    <span class="work-icon-mini">${p.icon}</span>
                    <div class="work-info-mini">
                        <div class="work-name-mini">${p.name}</div>
                        <div class="work-meta-mini">
                            <span class="work-status-mini ${statusClass}">${statusText}</span>
                            ${updateTimeHtml}
                        </div>
                    </div>
                    ${linkHtml}
                </div>
            </div>
        `;
    };
    
    // 生成树形结构HTML（所有项目按分类，精选不单独分组）
    let treeHtml = '<div class="works-tree">';
    
    // 按分类展示（所有项目包括精选都放入对应分类）
    categoryOrder.forEach(catId => {
        const catProjects = grouped[catId];
        if (!catProjects || catProjects.length === 0) return;
        
        const config = categoryConfig[catId] || { name: catId, color: '#64748b', desc: '' };
        
        // 精选项目排在前面
        const sortedProjects = [...catProjects].sort((a, b) => {
            const aFeatured = a.quality?.level === 'featured' ? 1 : 0;
            const bFeatured = b.quality?.level === 'featured' ? 1 : 0;
            return bFeatured - aFeatured;
        });
        
        treeHtml += `
            <div class="works-tree-section">
                <div class="tree-branch-header" style="--branch-color: ${config.color}">
                    <span class="branch-icon">${config.name.split(' ')[0]}</span>
                    <span class="branch-name">${config.name.split(' ').slice(1).join(' ')}</span>
                    <span class="branch-count">${sortedProjects.length}</span>
                    <span class="branch-desc">${config.desc}</span>
                </div>
                <div class="tree-branch-content">
                    ${sortedProjects.map((p) => renderProjectCard(p, allProjects.indexOf(p))).join('')}
                </div>
            </div>
        `;
    });
    
    treeHtml += '</div>';
    
    container.innerHTML = treeHtml;
    
}

function renderWorksGrid(projects) {
    const container = document.getElementById('works-list');
    
    if (!container) {
        console.warn('works-list container not found');
        return;
    }
    
    if (!projects?.projects || projects.projects.length === 0) {
        container.innerHTML = '<div class="no-data">暂无作品数据</div>';
        return;
    }
    
    // 按类型分组
    const typeMap = {
        'research': { icon: '🔬', name: '调研类', projects: [] },
        'tool': { icon: '🛠️', name: '工具类', projects: [] },
        'document': { icon: '📝', name: '文档类', projects: [] },
        'website': { icon: '🌐', name: '网页类', projects: [] },
        'automation': { icon: '⚡', name: '自动化', projects: [] },
        'other': { icon: '📦', name: '其他', projects: [] }
    };
    
    // 分组项目
    projects.projects.forEach(p => {
        const type = p.type || 'other';
        if (typeMap[type]) {
            typeMap[type].projects.push(p);
        } else {
            typeMap['other'].projects.push(p);
        }
    });
    
    // 将项目数据存入dataMap供tooltip使用
    projects.projects.forEach((p, idx) => {
        const projectId = 'project-' + idx;
        AppState.dataMap[projectId] = {
            ...p,
            type: 'project'
        };
    });
    
    // 生成分类HTML
    let projectIdx = 0;
    const categoriesHtml = Object.entries(typeMap)
        .filter(([_, cat]) => cat.projects.length > 0)
        .map(([typeKey, cat]) => {
            const projectsHtml = cat.projects.map(p => {
                const projectId = 'project-' + projectIdx++;
                const si = getStatusInfo(p.status);
                const statusClass = si.cls;
                const statusText = si.text;
                
                const quality = p.quality || {};
                const qualityLevel = quality.level || 'basic';
                let qualityBadgeHtml = getQualityBadgeHtml(qualityLevel);
                
                return `
                    <div class="work-card-mini ${statusClass}" 
                         onmouseenter="showProjectTooltip(event, '${projectId}')" 
                         onmouseleave="hideTooltip()">
                        ${qualityLevel === 'featured' ? qualityBadgeHtml : ''}
                        <span class="work-icon">${p.icon}</span>
                        <div class="work-info-mini">
                            <div class="work-name-mini">${p.name}</div>
                            <div class="work-subtitle-mini">${p.subtitle || ''}</div>
                        </div>
                        <span class="work-status-mini ${statusClass}">${statusText}</span>
                        ${p.url ? `<a href="${p.url}" target="_blank" class="work-link-mini">🔗</a>` : ''}
                    </div>
                `;
            }).join('');
            
            return `
                <div class="works-category">
                    <div class="works-category-header">
                        <span class="category-icon">${cat.icon}</span>
                        <span class="category-name">${cat.name}</span>
                        <span class="category-count">${cat.projects.length}</span>
                    </div>
                    <div class="works-category-list">
                        ${projectsHtml}
                    </div>
                </div>
            `;
        }).join('');
    
    container.innerHTML = categoriesHtml || '<div class="no-data">暂无作品数据</div>';
}

// ==================== 我的能力Section（合并技能树+关于我） ====================
function renderAbilitiesSection() {
    const skills = AppState.characterData?.skills;
    const knowledge = AppState.characterData?.knowledge;
    const memories = AppState.characterData?.memories;
    const achievements = AppState.characterData?.achievements || [];
    
    if (!skills || !knowledge || !memories) {
        console.warn('Character data not available for abilities section');
        return;
    }
    
    // 能力总览
    const abilitySkills = document.getElementById('ability-skills');
    const abilityKnowledge = document.getElementById('ability-knowledge');
    const abilityMemory = document.getElementById('ability-memory');
    const abilityAchievements = document.getElementById('ability-achievements');
    
    if (abilitySkills) abilitySkills.textContent = skills.total;
    if (abilityKnowledge) abilityKnowledge.textContent = knowledge.totalFiles;
    if (abilityMemory) abilityMemory.textContent = memories.total;
    if (abilityAchievements) abilityAchievements.textContent = achievements.filter(a => a.unlocked).length;
    
    // 统计数据（技能树面板）
    const skillTotal = document.getElementById('skill-total');
    const knowledgeTotal = document.getElementById('knowledge-total');
    const memoryTotal = document.getElementById('memory-total');
    
    if (skillTotal) skillTotal.textContent = skills.total;
    if (knowledgeTotal) knowledgeTotal.textContent = knowledge.totalFiles;
    if (memoryTotal) memoryTotal.textContent = memories.total;
    
    // 更新Tab计数
    const tabSkillCount = document.getElementById('tab-skill-count');
    const tabMemoryCount = document.getElementById('tab-memory-count');
    const tabKnowledgeCount = document.getElementById('tab-knowledge-count');
    if (tabSkillCount) tabSkillCount.textContent = skills.total;
    if (tabMemoryCount) tabMemoryCount.textContent = memories.total;
    if (tabKnowledgeCount) tabKnowledgeCount.textContent = knowledge.totalFiles;
    
    // 使用新的渲染函数（来自 ability-trees.js）
    const skillContainer = document.getElementById('skill-tree');
    const knowledgeContainer = document.getElementById('knowledge-tree');
    const memoryContainer = document.getElementById('memory-tree');
    
    // 技能树 - 科技树风格（来自 ability-trees.js）
    if (skillContainer && typeof renderSkillTechTree === 'function') {
        renderSkillTechTree(skillContainer, skills);
    } else {
        console.warn('ability-trees.js not loaded, skill tree rendering skipped');
    }
    
    // 知识树 - 纵向三层架构图（v3.0）
    if (knowledgeContainer && typeof renderKnowledgeArchive === 'function') {
        renderKnowledgeArchive(knowledgeContainer, knowledge);
    } else {
        renderKnowledgeTreeGraph(knowledge);
    }
    
    // 记忆树 - 纵向三层架构图 + 可展开卡片（v3.0）
    if (memoryContainer && typeof renderMemoryNeuralNetwork === 'function') {
        renderMemoryNeuralNetwork(memoryContainer, memories);
    } else {
        renderMemoryTreeGraph(memories);
    }
    
    // 渲染成就墙
    renderAchievements(achievements);
}

function getLevelClass(level) {
    if (level <= 1) return 'lv1';
    if (level <= 2) return 'lv2';
    if (level <= 3) return 'lv3';
    if (level <= 4) return 'lv4';
    return 'lv5';
}

// [已删除] 旧版技能树渲染器（renderSkillTreeGraph/WithLayers/Flat + toggleBranch 等）
// 已迁移到 ability-trees.js，此处约 400 行死代码在 2026-03-08 清理
// 如需回退到旧版渲染，请查看 git 历史

// 技能详情面板
// 技能详情面板
function showSkillDetailPanel(skillId) {
    const data = AppState.dataMap[skillId];
    if (!data) return;
    
    // 创建或复用详情面板
    let panel = document.getElementById('skill-detail-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'skill-detail-panel';
        panel.className = 'skill-detail-panel';
        document.body.appendChild(panel);
    }
    
    const levelClass = getLevelClass(data.level);
    
    panel.innerHTML = `
        <div class="skill-panel-header">
            <span class="skill-panel-icon">${data.catIcon || '⚡'}</span>
            <span class="skill-panel-name">${escapeHtml(data.name)}</span>
            <span class="skill-panel-level ${levelClass}">Lv.${data.level}</span>
            <button class="skill-panel-close" onclick="closeSkillDetailPanel()">✕</button>
        </div>
        <div class="skill-panel-body">
            <div class="skill-panel-row">
                <span class="skill-panel-label">描述</span>
                <span class="skill-panel-value">${escapeHtml(data.description || '暂无描述')}</span>
            </div>
            <div class="skill-panel-row">
                <span class="skill-panel-label">分类</span>
                <span class="skill-panel-value"><span class="tip-source-badge" data-type="${data.sourceLabel === '林克定制' ? 'link' : data.sourceLabel === '快手定制' ? 'ks' : data.sourceLabel === '个人定制' ? 'sl' : data.sourceLabel === '通用' ? 'generic' : 'other'}" style="display:inline">${escapeHtml(data.sourceLabel || '未知')}</span></span>
            </div>
            <div class="skill-panel-row">
                <span class="skill-panel-label">调用次数</span>
                <span class="skill-panel-value">${data.callCount ? data.callCount + ' 次' : '暂无数据'}</span>
            </div>
            <div class="skill-panel-row">
                <span class="skill-panel-label">使用频率</span>
                <span class="skill-panel-value">${data.frequency || '暂无数据'}</span>
            </div>
            <div class="skill-panel-row">
                <span class="skill-panel-label">最近更新</span>
                <span class="skill-panel-value">${data.lastUpdated || '暂无数据'}</span>
            </div>
        </div>
    `;
    
    panel.classList.add('active');
}

function closeSkillDetailPanel() {
    const panel = document.getElementById('skill-detail-panel');
    if (panel) {
        panel.classList.remove('active');
    }
}

window.showSkillDetailPanel = showSkillDetailPanel;
window.closeSkillDetailPanel = closeSkillDetailPanel;

// ==================== 通用二级导航切换（Tab模式） ====================
function switchSubTab(sectionId, tabName) {
    // 找到对应section下的所有sub-nav按钮和content
    const section = document.getElementById('section-' + sectionId);
    if (!section) {
        console.warn('Section not found:', sectionId);
        return;
    }
    
    // 切换按钮状态
    section.querySelectorAll('.sub-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    
    // 切换内容显示
    section.querySelectorAll('.sub-tab-content').forEach(content => {
        content.classList.toggle('active', content.getAttribute('data-tab') === tabName);
    });
}
window.switchSubTab = switchSubTab;

// ==================== 能力Tab切换 ====================
function switchAbilityTab(tabName) {
    // 切换按钮状态
    document.querySelectorAll('.ability-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-ability-tab') === tabName);
    });
    
    // 切换内容显示
    document.querySelectorAll('.ability-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === 'ability-tab-' + tabName);
    });
}
window.switchAbilityTab = switchAbilityTab;

function renderKnowledgeTreeGraph(knowledge) {
    const container = document.getElementById('knowledge-tree');
    if (!container) return;
    
    // v4.0: 直接从 JSON 数据中读取，不再维护本地映射表
    // character-data.json 中的 knowledge.categories 已包含 displayName/icon/description
    
    // v4.3: 后端只输出 categories，直接从中提取（消除幽灵字段 directories）
    const directories = knowledge.categories ? Object.entries(knowledge.categories).map(([key, cat]) => ({
        key: key,
        name: cat.name || key,
        count: cat.fileCount || 0,
        icon: cat.icon || '📁',
        color: cat.color,
        sizeKB: cat.sizeKB || 0,
        description: cat.description
    })) : [];
    
    if (directories.length === 0) {
        container.innerHTML = '<div class="no-data">暂无知识库数据</div>';
        return;
    }
    
    let idx = 0;
    let branches = '';
    
    for (const dir of directories) {
        const dirKey = dir.key || dir.name;
        // v4.0: 从 JSON 数据中直接读取显示信息，不再依赖本地映射表
        const chineseName = dir.displayName || dir.name || dirKey;
        const sourceDesc = dir.description || `${chineseName}相关文档`;
        const dirId = 'knowledge-dir-' + idx++;
        const dirIcon = dir.icon || '📁';
        
        // v4.2: 等级优先从后端数据读取（heatLevel），硬编码计算仅作为 fallback
        const level = dir.heatLevel || dir.level || (dir.count <= 10 ? 1 : dir.count <= 30 ? 2 : dir.count <= 60 ? 3 : dir.count <= 100 ? 4 : 5);
        
        AppState.dataMap[dirId] = { 
            name: chineseName, 
            icon: dirIcon, 
            level: level,
            description: `${chineseName}知识库，共收录${dir.count}个文档${dir.sizeKB ? `，总计${dir.sizeKB}KB` : ''}`,
            source: sourceDesc
        };
        
        // 知识树直接展示分类节点作为末级节点，不再展开叶子节点
        branches += `
            <div class="branch" style="color: var(--zelda-gold);">
                <div class="leaf-node lv${level}" 
                     style="border-color: var(--node-color); color: var(--node-color);"
                     onmouseenter="showTreeTooltip(event, '${dirId}', 'knowledge')" onmouseleave="hideTooltip()">
                    <span class="leaf-icon">${dirIcon}</span>
                    <span class="leaf-name">${chineseName}</span>
                    <span class="leaf-level" style="border-color: var(--node-color);">${dir.count}</span>
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="tree-graph">
            <div class="tree-root" style="color: var(--zelda-gold);">
                <div class="root-node" style="border-color: var(--zelda-gold); color: var(--zelda-gold);">
                    <span class="node-icon">📚</span>
                    <span class="node-level" style="border-color: var(--zelda-gold);">知识</span>
                </div>
            </div>
            <div class="branches">${branches}</div>
        </div>
    `;
}

function renderMemoryTreeGraph(memories) {
    const container = document.getElementById('memory-tree');
    if (!container) return;
    
    // 优先使用三层架构tree数据
    const tree = memories.tree;
    
    if (tree && Object.keys(tree).length > 0) {
        // 使用三层架构渲染
        renderMemoryTreeWithLayers(container, tree, memories.items || []);
        return;
    }
    
    // 回退：使用旧的byCategory数据
    let categoriesObj = memories.categories || memories.byCategory || {};
    
    // 获取记忆项目列表，用于显示每条记忆的具体描述
    const memoryItems = memories.items || [];
    
    // 按分类组织记忆项目
    const memoryItemsByCategory = {};
    memoryItems.forEach(item => {
        const cat = item.category;
        if (!memoryItemsByCategory[cat]) {
            memoryItemsByCategory[cat] = [];
        }
        memoryItemsByCategory[cat].push(item);
    });
    
    if (Object.keys(categoriesObj).length === 0) {
        container.innerHTML = '<div class="no-data">暂无记忆数据</div>';
        return;
    }
    
    // 计算记忆分类等级（v4.3: 优先读取后端数据 cat.level，fallback 全局 getMemoryLevel）
    
    let idx = 0;
    let branches = '';
    
    for (const [catKey, cat] of Object.entries(categoriesObj)) {
        const catName = cat.label || cat.name || catKey;
        const catCount = cat.count || 0;
        const catLevel = cat.level || getMemoryLevel(catCount);
        const catId = 'memory-cat-' + idx;
        
        AppState.dataMap[catId] = { 
            name: catName, 
            icon: '🧠', 
            level: catLevel, 
            description: cat.description || `${catName}类记忆，共${catCount}条`,
            source: '记忆库'
        };
        
        let leaves = '';
        const memCount = Math.min(catCount, 6);
        // 记忆树叶子节点显示简短标签
        const memoryLabels = {
            'development_practice_specification': ['规范', '标准', '实践', '流程', '模板', '指南'],
            'user_info': ['身份', '背景', '特征', '信息', '资料', '档案'],
            'user_communication': ['偏好', '风格', '习惯', '模式', '方式', '特点'],
            'task_flow_experience': ['流程', '方法', '经验', '策略', '技巧', '实践'],
            'constraint_or_forbidden_rule': ['约束', '禁止', '规则', '限制', '边界', '条例'],
            'common_pitfalls_experience': ['踩坑', '教训', '修复', '问题', '解决', '案例']
        };
        const defaultLabels = ['条目', '记录', '内容', '项目', '事项', '信息'];
        const labels = memoryLabels[catKey] || defaultLabels;
        
        // 获取该分类下的实际记忆项目
        const catMemoryItems = memoryItemsByCategory[catKey] || [];
        
        for (let i = 0; i < memCount; i++) {
            const mid = 'memory-' + (idx++);
            const memLabel = labels[i % labels.length];
            
            // 如果有实际的记忆项目数据，使用它的真实信息
            const actualMemory = catMemoryItems[i];
            const memName = actualMemory ? actualMemory.title : (catName + ' #' + (i+1));
            const memDesc = actualMemory ? actualMemory.description : `${catName}类别下的记忆条目`;
            
            AppState.dataMap[mid] = { 
                name: memName, 
                icon: '💭', 
                level: actualMemory ? (actualMemory.importance || catLevel) : catLevel, 
                description: memDesc,
                source: catName
            };
            leaves += `
                <div class="leaf-node ${getLevelClass(catLevel)}" 
                     style="border-color: var(--node-color); color: var(--node-color);"
                     onmouseenter="showTreeTooltip(event, '${mid}', 'memory')" onmouseleave="hideTooltip()">
                    <span class="leaf-name">${memLabel}</span>
                </div>
            `;
        }
        
        if (catCount > 6) {
            leaves += `<div class="leaf-more">+${catCount - 6}</div>`;
        }
        
        branches += `
            <div class="branch" style="color: var(--zelda-orange);">
                <div class="category-node ${getLevelClass(catLevel)}" 
                     style="border-color: var(--zelda-orange); color: var(--zelda-orange);"
                     onmouseenter="showTreeTooltip(event, '${catId}', 'memory')" onmouseleave="hideTooltip()">
                    <span class="cat-icon">${cat.icon || '📁'}</span>
                    <span class="cat-name">${catName}</span>
                    <span class="cat-level" style="border-color: var(--zelda-orange);">${catLevel}</span>
                    <span class="cat-count" style="border-color: var(--zelda-orange);">${catCount}</span>
                </div>
                <div class="leaves" style="color: var(--zelda-orange);">
                    ${leaves}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="tree-graph">
            <div class="tree-root" style="color: var(--zelda-orange);">
                <div class="root-node" style="border-color: var(--zelda-orange); color: var(--zelda-orange);">
                    <span class="node-icon">🧠</span>
                    <span class="node-level" style="border-color: var(--zelda-orange);">记忆</span>
                </div>
            </div>
            <div class="branches">${branches}</div>
        </div>
    `;
}

// 三层架构记忆树渲染（回退版本）
function renderMemoryTreeWithLayers(container, tree, memoryItems) {
    // 层级颜色映射（v4.0 通过 layerTag 匹配，消除中文耦合）
    const layerColorsByTag = {
        'L1-meta': '#a78bfa',
        'L2-domain': '#8b5cf6',
        'L3-execution': '#4ade80',
    };
    
    // v4.3: 使用 renderMemoryTree 中定义的 getMemoryLevel（消除重复）
    
    let idx = 0;
    let layerBranches = '';
    
    // 遍历三层架构
    for (const [layerName, layerInfo] of Object.entries(tree)) {
        if (layerInfo.count === 0) continue; // 跳过空层
        
        const layerColor = (layerInfo.layerTag && layerColorsByTag[layerInfo.layerTag]) || layerInfo.color || '#fb923c';
        const layerIcon = layerInfo.icon || '📁';
        const layerId = 'memory-layer-' + idx;
        
        AppState.dataMap[layerId] = {
            name: layerName,
            icon: layerIcon,
            level: getMemoryLevel(layerInfo.count),
            description: layerInfo.description || layerName,
            source: '记忆库'
        };
        
        let childBranches = '';
        
        // 遍历子分类
        for (const [childName, childInfo] of Object.entries(layerInfo.children || {})) {
            if (childInfo.count === 0) continue;
            
            const childLevel = getMemoryLevel(childInfo.count);
            const childId = 'memory-child-' + idx;
            
            AppState.dataMap[childId] = {
                name: childName,
                icon: childInfo.icon || '📁',
                level: childLevel,
                description: childInfo.description || `${childName}，共${childInfo.count}条`,
                source: layerName
            };
            
            // 渲染叶子节点（取前6个记忆）
            let leaves = '';
            const childItems = childInfo.items || [];
            const leafCount = Math.min(childItems.length, 6);
            
            // 简短标签
            const shortLabels = ['条目', '记录', '内容', '项目', '事项', '信息'];
            
            for (let i = 0; i < leafCount; i++) {
                const mid = 'memory-item-' + (idx++);
                const item = childItems[i];
                const leafLabel = shortLabels[i % shortLabels.length];
                
                AppState.dataMap[mid] = {
                    name: item.title || `${childName} #${i+1}`,
                    icon: '💭',
                    level: item.importance || childLevel,
                    description: item.description || `${childName}类别下的记忆`,
                    source: childName
                };
                
                leaves += `
                    <div class="leaf-node ${getLevelClass(childLevel)}" 
                         style="border-color: ${layerColor}; color: ${layerColor};"
                         onmouseenter="showTreeTooltip(event, '${mid}', 'memory')" onmouseleave="hideTooltip()">
                        <span class="leaf-name">${leafLabel}</span>
                    </div>
                `;
            }
            
            if (childInfo.count > 6) {
                leaves += `<div class="leaf-more">+${childInfo.count - 6}</div>`;
            }
            
            childBranches += `
                <div class="branch" style="color: ${layerColor};">
                    <div class="category-node ${getLevelClass(childLevel)}" 
                         style="border-color: ${layerColor}; color: ${layerColor};"
                         onmouseenter="showTreeTooltip(event, '${childId}', 'memory')" onmouseleave="hideTooltip()">
                        <span class="cat-icon">${childInfo.icon || '📁'}</span>
                        <span class="cat-name">${childName}</span>
                        <span class="cat-level" style="border-color: ${layerColor};">${childLevel}</span>
                        <span class="cat-count" style="border-color: ${layerColor};">${childInfo.count}</span>
                    </div>
                    <div class="leaves" style="color: ${layerColor};">
                        ${leaves}
                    </div>
                </div>
            `;
            idx++;
        }
        
        // 层级分支 - 塞尔达风格
        const layerLevel = getMemoryLevel(layerInfo.count);
        // 从name中提取纯文字部分（去掉emoji前缀）
        const layerDisplayName = layerName.replace(/^[👤🧠🎯🛠️📚\s]+/, '').trim();
        const layerBranchId = 'memory-layer-branch-' + idx;
        layerBranches += `
            <div class="layer-branch zelda-layer" id="${layerBranchId}">
                <div class="layer-header" 
                     style="--layer-color: ${layerColor};"
                     onclick="toggleBranch('${layerBranchId}')"
                     onmouseenter="showTreeTooltip(event, '${layerId}', 'memory')" onmouseleave="hideTooltip()">
                    <span class="layer-icon">${layerIcon}</span>
                    <span class="layer-name">${layerDisplayName}</span>
                    <span class="layer-count">${layerInfo.count}</span>
                    <span class="layer-toggle">▼</span>
                </div>
                <div class="layer-children">
                    ${childBranches}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = `
        <div class="tree-graph memory-tree-layered">
            <div class="tree-root" style="color: var(--zelda-orange);">
                <div class="root-node" style="border-color: var(--zelda-orange); color: var(--zelda-orange);">
                    <span class="node-icon">🧠</span>
                    <span class="node-level" style="border-color: var(--zelda-orange);">记忆</span>
                </div>
            </div>
            <div class="layer-branches" style="margin-top: 15px;">
                ${layerBranches}
            </div>
        </div>
    `;
}

function renderAchievements(achievements) {
    // 同时渲染到两个成就墙位置
    // achievements-grid: 我的能力Section (已移除)
    // achievements-grid-2: 了解我Section
    const container2 = document.getElementById('achievements-grid-2');
    const statsEl2 = document.getElementById('achievements-stats-2');
    
    if (!container2) {
        console.warn('Achievements container not found');
        return;
    }
    
    // 统计
    const unlocked = achievements.filter(a => a.unlocked).length;
    const total = achievements.length;
    const statsText = `已解锁 ${unlocked}/${total}`;
    
    if (statsEl2) statsEl2.textContent = statsText;
    
    // 为每个成就生成唯一ID并存储数据
    achievements.forEach((a, idx) => {
        const achId = 'achievement-' + idx;
        AppState.dataMap[achId] = {
            name: a.name,
            icon: a.icon,
            desc: a.desc,
            date: a.date,
            unlocked: a.unlocked,
            id: a.id,
            rarity: a.rarity || 'common',
            progress: a.progress || 0,
            progressText: a.progressText || ''
        };
    });
    
    const html = achievements.map((a, idx) => {
        const rarity = a.rarity || 'common';
        const rarityLabel = RARITY_LABELS[rarity] || '普通';
        const progress = a.progress || 0;
        const progressText = a.progressText || '';
        
        // 进度条HTML（仅对未解锁的显示）
        let progressHtml = '';
        if (!a.unlocked && progress > 0 && progress < 100) {
            progressHtml = `
                <div class="ach-progress">
                    <div class="ach-progress-bar">
                        <div class="ach-progress-fill ${rarity}" style="width: ${progress}%"></div>
                    </div>
                    ${progressText ? `<div class="ach-progress-text">${progressText}</div>` : ''}
                </div>
            `;
        }
        
        return `
            <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'} rarity-${rarity}"
                 onclick="showAchievementModal('achievement-${idx}')">
                <div class="ach-icon">${a.icon}</div>
                <div class="ach-info">
                    <div class="ach-header">
                        <div class="ach-name">${escapeHtml(a.name)}</div>
                        <span class="ach-rarity-badge ${rarity}">${rarityLabel}</span>
                    </div>
                    <div class="ach-desc">${escapeHtml(a.desc)}</div>
                    <div class="ach-date">${a.unlocked ? '🗓️ ' + a.date : '🔒 未解锁'}</div>
                    ${progressHtml}
                </div>
            </div>
        `;
    }).join('');
    
    // 渲染到成就墙容器
    if (container2) container2.innerHTML = html;
}

// 成就详情弹窗
function showAchievementModal(id) {
    const data = AppState.dataMap[id];
    if (!data) return;
    
    const modal = document.getElementById('achievement-modal');
    const iconEl = document.getElementById('modal-icon');
    const nameEl = document.getElementById('modal-name');
    const rarityEl = document.getElementById('modal-rarity');
    const descEl = document.getElementById('modal-desc');
    const dateEl = document.getElementById('modal-date');
    
    if (!modal) return;
    
    iconEl.textContent = data.icon || '🏆';
    nameEl.textContent = data.name;
    
    rarityEl.textContent = RARITY_LABELS[data.rarity] || '普通';
    rarityEl.className = 'ach-rarity-badge ' + (data.rarity || 'common');
    
    descEl.textContent = data.desc || '暂无描述';
    dateEl.textContent = data.unlocked ? '解锁于 ' + data.date : '尚未解锁';
    
    modal.classList.add('active');
}

function closeAchievementModal(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('achievement-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 暴露到全局
window.showAchievementModal = showAchievementModal;
window.closeAchievementModal = closeAchievementModal;

// 成就Tooltip显示函数
function showAchievementTooltip(event, id) {
    const data = AppState.dataMap[id];
    if (!data) return;
    
    const tooltip = DOM.tooltip;
    if (!tooltip) return;
    
    // 填充数据
    const iconEl = tooltip.querySelector('.tip-icon');
    const nameEl = tooltip.querySelector('.tip-name');
    const typeEl = tooltip.querySelector('.tip-type');
    const lvNumEl = tooltip.querySelector('.tip-lv-num');
    const descEl = tooltip.querySelector('.tip-desc');
    const sourceEl = tooltip.querySelector('.tip-source');
    const sourceSection = tooltip.querySelector('.tip-source-section');
    const upgradeEl = tooltip.querySelector('.tip-upgrade');
    const upgradeSection = tooltip.querySelector('.tip-upgrade-section');
    
    iconEl.textContent = data.icon || '🏆';
    nameEl.textContent = data.name;
    typeEl.textContent = '成就';
    lvNumEl.textContent = data.unlocked ? '✓' : '🔒';
    
    descEl.textContent = data.desc || '暂无描述';
    descEl.style.whiteSpace = 'normal';
    
    // 显示解锁日期
    if (data.date && data.date !== '???') {
        sourceEl.textContent = '解锁日期: ' + data.date;
        sourceEl.style.whiteSpace = 'normal';
        sourceSection.style.display = 'block';
    } else if (!data.unlocked) {
        sourceEl.textContent = '尚未解锁';
        sourceSection.style.display = 'block';
    } else {
        sourceSection.style.display = 'none';
    }
    
    // 显示解锁条件或祝贺
    if (upgradeEl && upgradeSection) {
        if (data.unlocked) {
            upgradeEl.textContent = '🎉 恭喜！你已解锁此成就';
        } else {
            // 根据成就数据显示解锁条件（v4.2: 优先从数据源读取 unlockCondition）
            const fallbackConditions = {
                'sanqianshijie': '需要深度理解并模拟多种思维方式',
                'eternal_memory': '需要实现记忆跨模型持久化存储'
            };
            upgradeEl.textContent = data.unlockCondition || fallbackConditions[data.id] || '继续探索以解锁此成就';
        }
        upgradeEl.style.whiteSpace = 'normal';
        upgradeSection.style.display = 'block';
    }
    
    // 隐藏进度条（成就不需要进度条）
    tooltip.querySelector('.tip-progress').style.display = 'none';
    tooltip.querySelector('.tip-progress-text').style.display = 'none';
    
    // 定位
    const rect = event.currentTarget.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;
    
    if (left + 280 > window.innerWidth) left = rect.left - 280 - 15;
    if (top + 200 > window.innerHeight) top = window.innerHeight - 200 - 20;
    if (top < 20) top = 20;
    if (left < 20) left = 20;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.classList.add('visible');
}

window.showAchievementTooltip = showAchievementTooltip;

// ==================== Tooltip ====================

// 升级建议配置 - 与等级体系v3.0多条件升级对齐
const upgradeAdvice = {
    skill: {
        1: '💡 升级到🌿生长：调用10次+成功率60%以上。在对话中主动使用这个技能',
        2: '💡 升级到🌳成熟：调用50次+成功率75%+有沉淀记录。多场景使用并沉淀经验',
        3: '💡 升级到⚙️精通：调用200次+成功率85%+3条沉淀。持续深耕，提炼可复用模式',
        4: '💡 升级到✨圆满：调用500次+成功率90%+5条沉淀+2次进化。大师级深度',
        5: '🎉 已达满级！调用充分、成功率高、沉淀丰富，是核心能力之一'
    },
    knowledge: {
        1: '💡 升级方法：在对话中分享更多这个领域的内容，如"帮我学习/整理XXX"',
        2: '💡 升级方法：让我帮你做调研、写文档，产出的内容会沉淀到知识库',
        3: '💡 升级方法：系统整理该领域的知识体系，让我帮你做专题梳理',
        4: '💡 升级方法：持续深耕，产出原创见解和最佳实践',
        5: '🎉 已达满级！这个领域我已有丰富积累，可以提供深度支持'
    },
    memory: {
        1: '💡 升级方法：明确告诉我你的偏好，如"记住我喜欢XXX风格"',
        2: '💡 升级方法：给我更多具体的使用反馈，帮助精炼理解',
        3: '💡 升级方法：建立稳定的协作模式，形成默契的工作流程',
        4: '💡 升级方法：覆盖更多场景的偏好，让我预判更多需求',
        5: '🎉 已达满级！我已深度了解你在这方面的偏好和习惯'
    }
};

function showTreeTooltip(event, id, type) {
    const data = AppState.dataMap[id];
    if (!data) return;
    
    const tooltip = DOM.tooltip;
    if (!tooltip) return;
    
    const typeColors = {
        skill: 'var(--zonai-green)',
        knowledge: 'var(--zelda-gold)',
        memory: 'var(--zelda-orange)',
        mechanism: '#a78bfa'
    };
    
    // 填充数据
    const iconEl = tooltip.querySelector('.tip-icon');
    const nameEl = tooltip.querySelector('.tip-name');
    const typeEl = tooltip.querySelector('.tip-type');
    const lvNumEl = tooltip.querySelector('.tip-lv-num');
    const descEl = tooltip.querySelector('.tip-desc');
    const upgradeEl = tooltip.querySelector('.tip-upgrade');
    const upgradeSection = tooltip.querySelector('.tip-upgrade-section');
    const sourceBadge = tooltip.querySelector('.tip-source-badge');
    const metricsSection = tooltip.querySelector('.tip-metrics-section');
    
    iconEl.textContent = data.catIcon || data.icon || '⚡';
    nameEl.textContent = data.name;
    typeEl.textContent = type === 'skill' ? '技能' : type === 'knowledge' ? '知识' : type === 'mechanism' ? '运作机制' : '记忆';
    
    // mechanism类型特殊处理：显示周期而非Lv
    var isMechanism = (type === 'mechanism');
    var lvLabel = tooltip.querySelector('.tip-lv-max');
    if (isMechanism) {
        lvNumEl.textContent = data.level || '';
        if (lvLabel) lvLabel.textContent = '周期';
    } else {
        lvNumEl.textContent = data.level ? 'Lv.' + data.level : '';
        if (lvLabel) lvLabel.textContent = '/5';
    }
    
    // 来源badge（机制类型不显示）
    if (sourceBadge && data.sourceLabel && !isMechanism) {
        var badgeType = data.sourceLabel === '自定义' ? 'custom' : data.sourceLabel === '平台技能' ? 'platform' : 'other';
        sourceBadge.textContent = data.sourceLabel;
        sourceBadge.setAttribute('data-type', badgeType);
        sourceBadge.style.display = 'inline';
    } else if (sourceBadge) {
        sourceBadge.style.display = 'none';
    }
    
    // 指标（机制类型不显示）— 根据type动态调整标签
    if (metricsSection && !isMechanism) {
        var metricLabels = tooltip.querySelectorAll('.tip-metric-label');
        var hasMetrics = false;
        
        if (type === 'skill') {
            // 技能：调用 | 频率 | 成功率（规模在气泡标签上显示）
            tooltip.querySelector('.tip-call-count').textContent = data.callCount || 0;
            tooltip.querySelector('.tip-frequency').textContent = data.frequency || '0次/周';
            tooltip.querySelector('.tip-success-rate').textContent = (data.successRate !== undefined && data.successRate !== null) ? data.successRate + '%' : '0%';
            if (metricLabels[0]) metricLabels[0].textContent = '调用';
            if (metricLabels[1]) metricLabels[1].textContent = '频率';
            if (metricLabels[2]) metricLabels[2].textContent = '成功率';
            hasMetrics = true;
        } else if (type === 'knowledge' && data.callCount > 0) {
            // 知识：文档数 | 热度 | 关联数
            tooltip.querySelector('.tip-call-count').textContent = data.callCount;
            tooltip.querySelector('.tip-frequency').textContent = data.frequency || '-';
            tooltip.querySelector('.tip-success-rate').textContent = data.successRate || '-';
            if (metricLabels[0]) metricLabels[0].textContent = '文档';
            if (metricLabels[1]) metricLabels[1].textContent = '热度';
            if (metricLabels[2]) metricLabels[2].textContent = '关联';
            hasMetrics = true;
        } else if (type === 'memory' && data.callCount > 0) {
            // 记忆：记忆数 | 活跃度 | 重要度
            tooltip.querySelector('.tip-call-count').textContent = data.callCount;
            tooltip.querySelector('.tip-frequency').textContent = data.frequency || '-';
            tooltip.querySelector('.tip-success-rate').textContent = data.successRate || '-';
            if (metricLabels[0]) metricLabels[0].textContent = '记忆';
            if (metricLabels[1]) metricLabels[1].textContent = '活跃度';
            if (metricLabels[2]) metricLabels[2].textContent = '重要度';
            hasMetrics = true;
        }
        
        metricsSection.style.display = hasMetrics ? 'block' : 'none';
    } else if (metricsSection) {
        metricsSection.style.display = 'none';
    }
    
    // 描述区：添加项目标记前缀和技能规模
    var descText = data.description || '暂无描述';
    if (data.cfProject) {
        descText = '🔧 CodeFlicker项目 | ' + descText;
    } else if (data.ksInternal) {
        descText = '🏢 快手内部 | ' + descText;
    }
    // 对技能类型，在描述末尾追加规模信息
    if (type === 'skill' && data.skillSizeLabel) {
        descText = descText + ' | 📐 ' + data.skillSizeLabel;
    }
    descEl.textContent = descText;
    descEl.style.whiteSpace = 'normal';
    
    // 来源区块：技能tooltip中隐藏（统一用顶部 sourceBadge 标签）
    const sourceSection = tooltip.querySelector('.tip-source-section');
    if (sourceSection) sourceSection.style.display = 'none';
    
    // 显示升级建议（机制类型不显示）
    const lv = data.level || 1;
    if (upgradeEl && upgradeSection && upgradeAdvice[type] && !isMechanism) {
        upgradeEl.textContent = upgradeAdvice[type][lv] || upgradeAdvice[type][3];
        upgradeEl.style.whiteSpace = 'normal';
        upgradeSection.style.display = 'block';
    } else if (upgradeSection) {
        upgradeSection.style.display = 'none';
    }
    
    // 始终隐藏进度条
    tooltip.querySelector('.tip-progress').style.display = 'none';
    tooltip.querySelector('.tip-progress-text').style.display = 'none';
    
    // 定位
    const rect = event.currentTarget.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;
    
    if (left + 280 > window.innerWidth) left = rect.left - 280 - 15;
    if (top + 250 > window.innerHeight) top = window.innerHeight - 250 - 20;
    if (top < 20) top = 20;
    if (left < 20) left = 20;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
    tooltip.classList.add('visible');
}

window.showTreeTooltip = showTreeTooltip;

function showStatTooltip(event, type) {
    const data = AppState.sidebarStats[type];
    if (!data || !DOM.tooltip) return;
    
    const tooltip = DOM.tooltip;
    
    tooltip.querySelector('.tip-icon').textContent = data.icon;
    tooltip.querySelector('.tip-name').textContent = data.name;
    tooltip.querySelector('.tip-type').textContent = '统计';
    tooltip.querySelector('.tip-lv-num').textContent = data.value;
    tooltip.querySelector('.tip-lv-max').textContent = '';
    tooltip.querySelector('.tip-desc').textContent = data.description;
    
    const sourceSection = tooltip.querySelector('.tip-source-section');
    const sourceEl = tooltip.querySelector('.tip-source');
    if (data.categories) {
        sourceEl.textContent = data.categories;
        sourceSection.style.display = 'block';
    } else {
        sourceSection.style.display = 'none';
    }
    
    tooltip.querySelector('.tip-progress').style.display = 'none';
    tooltip.querySelector('.tip-progress-text').style.display = 'none';
    
    const rect = event.currentTarget.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;
    
    if (left + 280 > window.innerWidth) left = rect.left - 280 - 15;
    if (top < 20) top = 20;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
    tooltip.classList.add('visible');
}

window.showStatTooltip = showStatTooltip;

// 作品详情Tooltip
function showProjectTooltip(event, id) {
    const data = AppState.dataMap[id];
    if (!data || !DOM.tooltip) return;
    
    const tooltip = DOM.tooltip;
    
    // 构建详细内容
    const deliverables = (data.deliverables || []).join('、') || '暂无';
    const techStack = (data.techStack || []).join('、') || '暂无';
    const highlights = (data.highlights || []).map(h => '• ' + h).join('\n') || '暂无';
    
    // 项目用到的技能映射（v4.2: 优先从项目数据中读取 usedSkills，硬编码仅作 fallback — SSoT）
    const fallbackSkillsMap = {
        'bytedance-ai-guide': ['industry-research', 'github-deploy-publisher', 'qingshuang-research-style'],
        'ai-product-ultimate': ['industry-research', 'research', 'frontend-design'],
        'ai-engineer-analysis': ['research', 'industry-research'],
        'ai-financial-analysis': ['stock-analysis', 'research'],
        'feishu-bot': ['mcp-builder', 'feishu-assistant'],
        'daily-report-system': ['github-deploy-publisher', 'qingshuang-research-style', 'personal-assistant'],
        'github-sync': ['github-deploy-publisher'],
        'character-panel': ['ui-ux-pro-max', 'frontend-design', 'zelda-style', 'github-deploy-publisher']
    };
    const projectSkills = data.usedSkills || fallbackSkillsMap[data.id] || [];
    
    // 使用全局 skillNameMap（from ability-trees.js 动态构建，基于 character-data.json）
    // 所有名称统一从 SKILL_NAME_MAP 获取，不再维护本地 tooltipNameOverrides
    const baseMap = window.SKILL_NAME_MAP || {};
    const getSkillDisplayName = (s) => baseMap[s] || s;
    
    const usedSkills = projectSkills
        .map(s => getSkillDisplayName(s))
        .join('、') || '暂无';
    
    // 填充数据
    tooltip.querySelector('.tip-icon').textContent = data.icon || '📦';
    tooltip.querySelector('.tip-name').textContent = data.name;
    tooltip.querySelector('.tip-type').textContent = '作品';
    tooltip.querySelector('.tip-lv-num').textContent = data.status === 'deployed' ? '已上线' : 
                                                       data.status === 'development' ? '开发中' : '已归档';
    tooltip.querySelector('.tip-lv-max').textContent = '';
    
    // 构建详细描述
    const fullDesc = `🎯 项目目标\n${data.goal || '暂无'}\n\n📦 交付物\n${deliverables}\n\n✨ 亮点\n${highlights}\n\n⚡ 使用技能\n${usedSkills}`;
    
    const descEl = tooltip.querySelector('.tip-desc');
    descEl.textContent = fullDesc;
    descEl.style.whiteSpace = 'pre-wrap';
    
    // 来源显示技术栈
    const sourceSection = tooltip.querySelector('.tip-source-section');
    const sourceEl = tooltip.querySelector('.tip-source');
    sourceEl.textContent = '技术栈: ' + techStack;
    sourceEl.style.whiteSpace = 'normal';
    sourceSection.style.display = 'block';
    
    // 隐藏升级建议
    const upgradeSection = tooltip.querySelector('.tip-upgrade-section');
    if (upgradeSection) upgradeSection.style.display = 'none';
    
    // 隐藏进度条
    tooltip.querySelector('.tip-progress').style.display = 'none';
    tooltip.querySelector('.tip-progress-text').style.display = 'none';
    
    // 定位 - 作品卡片较大，tooltip显示在右侧或下方
    const rect = event.currentTarget.getBoundingClientRect();
    let left = rect.right + 15;
    let top = rect.top;
    
    // 如果右侧空间不够，显示在左侧
    if (left + 300 > window.innerWidth) {
        left = rect.left - 300 - 15;
    }
    // 如果左侧也不够，显示在下方居中
    if (left < 20) {
        left = Math.max(20, rect.left + rect.width / 2 - 150);
        top = rect.bottom + 10;
    }
    // 确保不超出底部
    if (top + 350 > window.innerHeight) {
        top = window.innerHeight - 350 - 20;
    }
    if (top < 20) top = 20;
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
    tooltip.classList.add('visible');
}

window.showProjectTooltip = showProjectTooltip;

function hideTooltip() {
    if (DOM.tooltip) {
        DOM.tooltip.style.opacity = '0';
        DOM.tooltip.style.transform = 'translateY(10px)';
        DOM.tooltip.classList.remove('visible');
    }
}

window.hideTooltip = hideTooltip;

// ==================== 图表渲染 - 修复隶藏状态渲染问题 ====================
let chartInstances = {
    radarChart: null,
    miniTrendChart: null,
    abilityRadarChart: null,
    trendChart: null
};

function renderCharts() {
    // 图表需要Chart.js，使用动态加载
    loadChartJS().then(() => {
        // 侧边栏图表始终可见，直接渲染
        renderRadarChart();
        renderMiniTrendChart();
        
        // 能力Section的图表需要等待section可见后再渲染
        setupDeferredCharts();
    }).catch(e => console.error('Failed to load Chart.js:', e));
}

// 延迟初始化：等待section可见后再渲染图表
function setupDeferredCharts() {
    const abilitiesSection = document.getElementById('section-abilities');
    if (!abilitiesSection) return;
    
    // 使用IntersectionObserver监听能力Section的可见性
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Section可见时渲染图表
                setTimeout(() => {
                    renderAbilityRadarChart();
                    renderTrendChart();
                }, 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    observer.observe(abilitiesSection);
    
    // 备用方案：监听Tab切换事件
    DOM.navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.dataset.section === 'abilities') {
                setTimeout(() => {
                    renderAbilityRadarChart();
                    renderTrendChart();
                }, 300);
            }
        });
    });
}

function renderRadarChart() {
    if (!window.Chart) {
        return;
    }
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    
    // 侧边栏始终可见，不需要可见性检查
    
    const stats = AppState.characterData?.character?.stats;
    if (!stats) {
        return;
    }
    
    // 销毁旧实例
    if (chartInstances.radarChart) {
        chartInstances.radarChart.destroy();
    }
    
    // v5.0: 雷达图标签从数据源读取（SSoT — 与四维能力定义保持一致）
    const dimsMeta = AppState.characterData?.character?.dimensionsMeta;
    const radarLabels = (Array.isArray(dimsMeta) && dimsMeta.length > 0) 
        ? dimsMeta.map(d => d.shortName || d.name)
        : ['懂你', '技能', '沉淀', '经验', '思考'];
    
    chartInstances.radarChart = new Chart(canvas, {
        type: 'radar',
        data: {
            labels: radarLabels,
            datasets: [{
                data: dimsMeta && dimsMeta.length > 0
                    ? dimsMeta.map(d => stats[d.key] || 0)
                    : [stats.understanding || 0, stats.skillDepth || 0, stats.quality || 0, stats.experience || 0, stats.thinkingDepth || 0],
                backgroundColor: 'rgba(0, 212, 255, 0.2)',
                borderColor: '#00d4ff',
                borderWidth: 2,
                pointBackgroundColor: '#00d4ff',
                pointBorderColor: '#00d4ff',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(0, 212, 255, 0.2)' },
                    grid: { color: 'rgba(0, 212, 255, 0.2)' },
                    pointLabels: { color: '#f5e6c8', font: { size: 10 } },
                    ticks: { display: false },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderMiniTrendChart() {
    if (!window.Chart) {
        return;
    }
    const canvas = document.getElementById('miniTrendChart');
    if (!canvas) return;
    
    // 侧边栏始终可见，不需要可见性检查
    
    const trend = AppState.reportsData?.trend;
    if (!trend) {
        return;
    }
    
    // 销毁旧实例
    if (chartInstances.miniTrendChart) {
        chartInstances.miniTrendChart.destroy();
    }
    
    chartInstances.miniTrendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: trend.dates,
            datasets: [{
                data: trend.skills,
                borderColor: '#00d4ff',
                borderWidth: 2,
                fill: false,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: { display: false }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderAbilityRadarChart() {
    if (!window.Chart) {
        loadChartJS().then(() => renderAbilityRadarChart());
        return;
    }
    const canvas = document.getElementById('abilityRadarChart');
    if (!canvas) return;
    
    // 移除可见性检查，信任ensureSectionRendered的setTimeout时序
    
    const stats = AppState.characterData?.character?.stats;
    if (!stats) {
        return;
    }
    
    // 销毁旧实例
    if (chartInstances.abilityRadarChart) {
        chartInstances.abilityRadarChart.destroy();
    }
    
    // v4.2: 雷达图标签从数据源读取（SSoT）
    const dimsMeta2 = AppState.characterData?.character?.dimensionsMeta;
    const radarLabels2 = (Array.isArray(dimsMeta2) && dimsMeta2.length > 0)
        ? dimsMeta2.map(d => d.shortName || d.name)
        : ['懂你', '技能', '沉淀', '经验', '思考'];
    
    chartInstances.abilityRadarChart = new Chart(canvas, {
        type: 'radar',
        data: {
            labels: radarLabels2,
            datasets: [{
                data: dimsMeta2 && dimsMeta2.length > 0
                    ? dimsMeta2.map(d => stats[d.key] || 0)
                    : [stats.understanding || 0, stats.skillDepth || 0, stats.quality || 0, stats.experience || 0, stats.thinkingDepth || 0],
                backgroundColor: 'rgba(0, 212, 255, 0.3)',
                borderColor: '#00d4ff',
                borderWidth: 2,
                pointBackgroundColor: '#00d4ff',
                pointBorderColor: '#fff',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(0, 212, 255, 0.3)' },
                    grid: { color: 'rgba(0, 212, 255, 0.2)' },
                    pointLabels: { color: '#f5e6c8', font: { size: 12, weight: 'bold' } },
                    ticks: { display: false },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// ==================== 成长趋势仪表板 v3.0 ====================
let _growthPeriod = 14;

function getGrowthData(period) {
    const trend = AppState.reportsData?.trend;
    if (!trend || !trend.dates) return null;

    // v3.1 修复：understanding 可能缺失（旧数据/生成脚本未补齐），兜底到 memory，避免趋势Tab整块报错。
    const understandingArr = trend.understanding && trend.understanding.length ? trend.understanding : trend.memory;

    const len = trend.dates.length;
    if (period === 0 || period >= len) {
        return { dates: trend.dates, skills: trend.skills, knowledge: trend.knowledge, memory: trend.memory, understanding: understandingArr };
    }
    const start = Math.max(0, len - period);
    return {
        dates: trend.dates.slice(start),
        skills: trend.skills.slice(start),
        knowledge: trend.knowledge.slice(start),
        memory: trend.memory.slice(start),
        understanding: understandingArr.slice(start)
    };
}

function renderGrowthCards(data) {
    const dims = [
        { key: 'understanding', icon: '🤝', name: '懂你', color: '#00d4ff' },
        { key: 'skills', icon: '⚡', name: '技能', color: '#0891b2' },
        { key: 'knowledge', icon: '📚', name: '知识', color: '#b8860b' },
        { key: 'memory', icon: '🧠', name: '记忆', color: '#8b5cf6' }
    ];
    
    dims.forEach(dim => {
        const arr = data[dim.key];
        if (!arr || arr.length === 0) return;
        
        const current = arr[arr.length - 1];
        const start = arr[0];
        const change = current - start;
        const pct = start > 0 ? Math.round(((current - start) / start) * 100) : 0;
        
        const valueEl = document.getElementById(`growth-value-${dim.key}`);
        const badgeEl = document.getElementById(`growth-badge-${dim.key}`);
        const rateEl = document.getElementById(`growth-rate-${dim.key}`);
        
        if (valueEl) valueEl.textContent = current;
        if (badgeEl) {
            badgeEl.textContent = change >= 0 ? `+${change}` : `${change}`;
            badgeEl.className = 'growth-card-badge ' + (change > 0 ? 'positive' : 'neutral');
        }
        if (rateEl) {
            rateEl.textContent = pct !== 0 ? `${pct > 0 ? '+' : ''}${pct}% 相较期初` : '持平';
        }
        
        // Sparkline
        renderSparkline(`sparkline-${dim.key}`, arr, dim.color);
    });
}

function renderSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || data.length < 2) return;
    
    const dpr = window.devicePixelRatio || 1;
    // Use offsetWidth as fallback, then hardcoded minimum
    const w = canvas.clientWidth || canvas.offsetWidth || 80;
    const h = canvas.clientHeight || canvas.offsetHeight || 32;
    
    // If canvas still has no size (hidden tab), retry after a delay
    if (w <= 1 || h <= 1) {
        setTimeout(() => renderSparkline(canvasId, data, color), 200);
        return;
    }
    
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padY = 3;
    
    const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * w,
        y: padY + (1 - (v - min) / range) * (h - padY * 2)
    }));
    
    // Fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '05');
    ctx.fillStyle = grad;
    ctx.fill();
    
    // Line
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // End dot
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function renderGrowthInsight(data) {
    const el = document.getElementById('growth-insight-text');
    if (!el) return;
    
    const dims = [
        { key: 'understanding', name: '懂你', icon: '🤝' },
        { key: 'skills', name: '技能', icon: '⚡' },
        { key: 'knowledge', name: '知识', icon: '📚' },
        { key: 'memory', name: '记忆', icon: '🧠' }
    ];
    
    let bestDim = null, bestPct = -Infinity;
    const insights = [];
    
    dims.forEach(dim => {
        const arr = data[dim.key];
        if (!arr || arr.length < 2) return;
        const start = arr[0], end = arr[arr.length - 1];
        const pct = start > 0 ? Math.round(((end - start) / start) * 100) : 0;
        insights.push({ ...dim, start, end, change: end - start, pct });
        if (pct > bestPct) { bestPct = pct; bestDim = { ...dim, start, end, pct }; }
    });
    
    if (!bestDim) { el.textContent = '数据不足，无法生成洞察'; return; }
    
    const parts = [];
    if (bestDim.pct > 0) {
        parts.push(`<b>${bestDim.icon} ${bestDim.name}</b>增长最为显著，从 ${bestDim.start} 增至 ${bestDim.end}，涨幅 <b>${bestDim.pct}%</b>。`);
    }
    
    const totalChange = insights.reduce((s, d) => s + d.change, 0);
    if (totalChange > 10) {
        parts.push(`整体能力持续高速成长 🚀`);
    } else if (totalChange > 0) {
        parts.push(`各维度均稳步提升中 📈`);
    }
    
    el.innerHTML = parts.join(' ') || '当前时段暂无明显变化';
}

function renderTrendChart() {
    if (!window.Chart) {
        loadChartJS().then(() => renderTrendChart());
        return;
    }
    
    const data = getGrowthData(_growthPeriod);
    if (!data) return;
    
    // Render cards, insight, bars
    renderGrowthCards(data);
    renderGrowthInsight(data);
    renderGrowthBars(data);
    
    // Main chart
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    // Wait for canvas to have proper dimensions (tab might still be transitioning)
    if (canvas.clientWidth <= 1) {
        setTimeout(() => renderTrendChart(), 250);
        return;
    }
    
    if (chartInstances.trendChart) chartInstances.trendChart.destroy();
    
    const skillsNorm = normalizeChartData(data.skills);
    const knowledgeNorm = normalizeChartData(data.knowledge);
    const memoryNorm = normalizeChartData(data.memory);
    const understandingNorm = normalizeChartData(data.understanding);
    
    const allNorm = [...skillsNorm, ...knowledgeNorm, ...memoryNorm, ...understandingNorm];
    const minN = Math.min(...allNorm);
    const maxN = Math.max(...allNorm);
    const pad = Math.max(5, Math.ceil((maxN - minN) * 0.25));
    
    chartInstances.trendChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: `技能 (+${getChartChange(data.skills)})`,
                    data: skillsNorm,
                    borderColor: '#0891b2',
                    backgroundColor: 'rgba(8, 145, 178, 0.08)',
                    fill: true, tension: 0.4,
                    pointRadius: 4, pointHoverRadius: 8,
                    pointBackgroundColor: '#0891b2',
                    pointBorderColor: 'rgba(255,255,255,0.9)', pointBorderWidth: 2,
                    borderWidth: 2.5,
                    originalData: data.skills
                },
                {
                    label: `知识 (+${getChartChange(data.knowledge)})`,
                    data: knowledgeNorm,
                    borderColor: '#b8860b',
                    backgroundColor: 'rgba(184, 134, 11, 0.08)',
                    fill: true, tension: 0.4,
                    pointRadius: 4, pointHoverRadius: 8,
                    pointBackgroundColor: '#b8860b',
                    pointBorderColor: 'rgba(255,255,255,0.9)', pointBorderWidth: 2,
                    borderWidth: 2.5,
                    originalData: data.knowledge
                },
                {
                    label: `记忆 (+${getChartChange(data.memory)})`,
                    data: memoryNorm,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.08)',
                    fill: true, tension: 0.4,
                    pointRadius: 4, pointHoverRadius: 8,
                    pointBackgroundColor: '#8b5cf6',
                    pointBorderColor: 'rgba(255,255,255,0.9)', pointBorderWidth: 2,
                    borderWidth: 2.5,
                    originalData: data.memory
                },
                {
                    label: `懂你程度 (+${getChartChange(data.understanding)})`,
                    data: understandingNorm,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.08)',
                    fill: true, tension: 0.4,
                    pointRadius: 4, pointHoverRadius: 8,
                    pointBackgroundColor: '#00d4ff',
                    pointBorderColor: 'rgba(255,255,255,0.9)', pointBorderWidth: 2,
                    borderWidth: 2.5,
                    originalData: data.understanding
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { color: 'rgba(107, 83, 68, 0.06)' },
                    ticks: { color: 'rgba(107, 83, 68, 0.55)', font: { size: 11, family: "'Noto Serif SC', serif" } }
                },
                y: {
                    grid: { color: 'rgba(107, 83, 68, 0.06)' },
                    ticks: {
                        color: 'rgba(107, 83, 68, 0.55)',
                        font: { size: 10 },
                        callback: function(v) {
                            if (v === 100) return '基准';
                            return (v > 100 ? '+' : '') + (v - 100) + '%';
                        }
                    },
                    min: Math.max(95, minN - pad),
                    max: maxN + pad
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: 'rgba(107, 83, 68, 0.8)',
                        usePointStyle: true,
                        font: { size: 12, family: "'Noto Serif SC', serif" },
                        padding: 18
                    }
                },
                tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: 'rgba(42, 37, 32, 0.92)',
                    titleColor: '#f5e6c8',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyColor: '#f5e6c8',
                    bodyFont: { size: 12 },
                    borderColor: 'rgba(107, 83, 68, 0.3)',
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        title: function(ctx) { return '📅 ' + ctx[0].label; },
                        label: function(ctx) {
                            const label = ctx.dataset.label.split(' ')[0];
                            const orig = ctx.dataset.originalData;
                            const actual = orig ? orig[ctx.dataIndex] : ctx.parsed.y;
                            const g = ctx.parsed.y - 100;
                            const gs = g > 0 ? `+${g}%` : (g < 0 ? `${g}%` : '—');
                            return ` ${TREND_ICONS[label] || ''} ${label}: ${actual} (${gs})`;
                        }
                    }
                }
            }
        }
    });
}

function renderGrowthBars(data) {
    const container = document.getElementById('growth-bars');
    if (!container) return;
    
    const dims = [
        { key: 'understanding', icon: '🤝', name: '懂你', cls: 'understanding' },
        { key: 'skills', icon: '⚡', name: '技能', cls: 'skills' },
        { key: 'knowledge', icon: '📚', name: '知识', cls: 'knowledge' },
        { key: 'memory', icon: '🧠', name: '记忆', cls: 'memory' }
    ];
    
    // Find max pct for bar scaling
    let maxPct = 0;
    const dimData = dims.map(dim => {
        const arr = data[dim.key];
        const start = arr[0], end = arr[arr.length - 1];
        const pct = start > 0 ? Math.round(((end - start) / start) * 100) : 0;
        if (pct > maxPct) maxPct = pct;
        return { ...dim, start, end, change: end - start, pct };
    });
    
    if (maxPct === 0) maxPct = 1;
    
    container.innerHTML = dimData.map(d => {
        const barWidth = Math.max(8, (d.pct / maxPct) * 100);
        return `
            <div class="growth-bar-item">
                <div class="growth-bar-label">${d.icon} ${d.name}</div>
                <div class="growth-bar-track">
                    <div class="growth-bar-fill ${d.cls}" style="width: 0%;" data-width="${barWidth}%">
                        <span class="growth-bar-pct">${d.pct > 0 ? '+' + d.pct + '%' : '—'}</span>
                    </div>
                </div>
                <div class="growth-bar-abs">${d.start} → ${d.end}</div>
            </div>
        `;
    }).join('');
    
    // Animate bars with delay to ensure DOM layout is complete
    setTimeout(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                container.querySelectorAll('.growth-bar-fill').forEach(el => {
                    el.style.width = el.dataset.width;
                });
            });
        });
    }, 100);
}

function switchGrowthPeriod(period) {
    _growthPeriod = period;
    
    // Update toggle buttons
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.period) === period);
    });
    
    renderTrendChart();
}

window.switchGrowthPeriod = switchGrowthPeriod;

// ==================== 里程碑渲染 ====================
function renderMilestones() {
    const container = document.getElementById('milestone-timeline');
    if (!container) return;
    
    const milestones = AppState.milestonesData?.milestones || [];
    
    if (milestones.length === 0) {
        container.innerHTML = '<div class="timeline-empty">暂无里程碑数据</div>';
        return;
    }
    
    // 只显示前8个里程碑
    const displayMilestones = milestones.slice(0, 8);
    
    container.innerHTML = displayMilestones.map(m => {
        const typeClass = m.type || 'feature';
        return `
            <div class="timeline-item ${typeClass}" ${m.url ? `onclick="window.open('${m.url}', '_blank')" style="cursor:pointer"` : ''}>
                <div class="timeline-date">${m.date}</div>
                <div class="timeline-content">
                    <div class="timeline-event">${m.icon || '✨'} ${escapeHtml(m.title)}</div>
                    ${m.description && m.description !== m.title ? `<div class="timeline-desc">${escapeHtml(m.description.substring(0, 50))}${m.description.length > 50 ? '...' : ''}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// (Compare mode removed in v3.0 - replaced by growth dashboard with period toggle)

// ==================== 进化历程时间线渲染 ====================
function renderEvolutionTimeline() {
    const evolutionData = AppState.evolutionData?.evolution;
    if (!evolutionData) {
        return;
    }
    
    const container = document.querySelector('.evolution-timeline');
    if (!container) {
        console.warn('Evolution timeline container not found');
        return;
    }
    
    const stages = evolutionData.stages || [];
    
    // 只渲染版本阶段（精简版：少就是多）
    const stagesHtml = stages.map((stage, idx) => {
        let statusClass = '';
        if (stage.status === 'current') statusClass = 'current';
        else if (stage.status === 'in_progress') statusClass = 'in-progress';
        else if (stage.status === 'future') statusClass = 'future';
        
        const dateDisplay = stage.date ? stage.date.replace(/-/g, '.').substring(0, 7) : '未来';
        const version = stage.version === '∞' ? 'v∞' : 'v' + stage.version;
        
        const capabilitiesHtml = (stage.capabilities || []).slice(0, 3).map(cap => 
            `<span class="evo-cap-tag">${cap}</span>`
        ).join('');
        
        return `
            <div class="evolution-item ${statusClass}">
                <div class="evolution-header-inline">
                    <span class="evolution-version">${version}</span>
                    <span class="evolution-date">${dateDisplay}</span>
                </div>
                <div class="evolution-content">
                    <div class="evolution-name">${stage.icon} ${stage.name}</div>
                    <div class="evolution-subtitle-tag">${stage.subtitle || ''}</div>
                    <div class="evolution-desc">${stage.description}</div>
                    ${capabilitiesHtml ? `<div class="evolution-capabilities">${capabilitiesHtml}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // 只渲染进化阶段（移除了事件时间线和摘要卡片）
    container.innerHTML = stagesHtml;
    
    // 更新进化历程标题的副标题
    const subtitleEl = document.querySelector('.evolution-subtitle');
    if (subtitleEl) {
        subtitleEl.textContent = evolutionData.description || '从工具到数字生命的蜕变';
    }
    
}
