import { appState } from '../module0_AppState.js';
import { createNewProject, loadProject, renderProjectList, saveCurrentProjectData } from '../module2_TreeData.js';
import { buildSceneFromTree } from '../VisualComponents/index.js';
import { showToast } from '../module5_SelectAndEdit.js';
import { applyLoadedData } from '../module9_FileIO.js';
import * as THREE from 'three';

let isStartPageVisible = false;

export function showStartPage(withSlideDown = false) {
    const startPage = document.getElementById('startPage');
    if (!startPage) return;
    
    // 重置动画状态
    startPage.classList.remove('slide-up-exit');
    
    if (withSlideDown) {
        // 从下方滑入入场动画
        startPage.classList.add('slide-down-enter');
        startPage.style.display = 'flex';
        
        // 动画结束后移除动画类
        startPage.addEventListener('animationend', function handler(e) {
            if (e.animationName === 'slideDownEnter') {
                startPage.removeEventListener('animationend', handler);
                startPage.classList.remove('slide-down-enter');
            }
        });
    } else {
        startPage.style.display = 'flex';
    }
    
    isStartPageVisible = true;
    
    renderRecentProjects();
    bindStartPageEvents();
}

export function hideStartPage() {
    const startPage = document.getElementById('startPage');
    if (!startPage) return;
    
    // 添加向上滑动动画
    startPage.classList.add('slide-up-exit');
    
    // 动画结束后真正隐藏
    startPage.addEventListener('transitionend', function handler(e) {
        if (e.propertyName === 'transform' || e.propertyName === 'opacity') {
            startPage.removeEventListener('transitionend', handler);
            startPage.style.display = 'none';
            startPage.classList.remove('slide-up-exit');
            isStartPageVisible = false;
        }
    });
}

export function toggleStartPage() {
    if (isStartPageVisible) {
        hideStartPage();
    } else {
        showStartPage();
    }
}

function renderRecentProjects() {
    const listContainer = document.getElementById('recentProjectsList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    const projects = appState.projects || [];
    
    if (projects.length === 0) {
        listContainer.innerHTML = '<div class="start-page-empty">暂无项目，点击上方按钮创建新项目</div>';
        return;
    }
    
    projects.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'recent-project-item';
        
        const meta = proj.folderPath 
            ? proj.folderPath.split(/[\\/]/).pop()
            : '未保存';
        
        item.innerHTML = `
            <div class="recent-project-info">
                <div class="recent-project-name">${escapeHtml(proj.name)}</div>
                <div class="recent-project-meta">${meta}</div>
            </div>
            <button class="recent-project-open" data-project-id="${proj.id}">打开</button>
        `;
        
        const openBtn = item.querySelector('.recent-project-open');
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openProject(proj.id);
        });
        
        item.addEventListener('click', () => {
            openProject(proj.id);
        });
        
        listContainer.appendChild(item);
    });
}

function bindStartPageEvents() {
    const newProjectBtn = document.getElementById('startPageNewProject');
    const openProjectBtn = document.getElementById('startPageOpenProject');
    const closeBtn = document.getElementById('startPageClose');
    
    if (newProjectBtn && !newProjectBtn.hasAttribute('data-bound')) {
        newProjectBtn.setAttribute('data-bound', 'true');
        newProjectBtn.addEventListener('click', () => {
            createNewProject('新项目');
            hideStartPage();
            renderProjectList();
        });
    }
    
    if (openProjectBtn && !openProjectBtn.hasAttribute('data-bound')) {
        openProjectBtn.setAttribute('data-bound', 'true');
        openProjectBtn.addEventListener('click', () => {
            if (window.__ELECTRON__) {
                window.api.loadProject().then(result => {
                    if (result.canceled) {
                        return;
                    }

                    if (result.success) {
                        applyLoadedData(result.data, result.folderName || 'knowledge_graph', result.folderPath);
                        hideStartPage();
                        renderProjectList();
                        showToast('已加载：' + (result.folderName || 'knowledge_graph'));
                    } else {
                        showToast('加载失败: ' + (result.error || '未知错误'));
                    }
                }).catch(err => {
                    showToast('加载失败: ' + err.message);
                });
            } else {
                console.warn('Web版暂不支持打开外部项目文件');
            }
        });
    }

    // 关闭按钮 - 退出应用
    if (closeBtn && !closeBtn.hasAttribute('data-bound')) {
        closeBtn.setAttribute('data-bound', 'true');
        closeBtn.addEventListener('click', () => {
            if (window.api?.closeApp) {
                window.api.closeApp();
            }
        });
    }
}

function openProject(projectId) {
    hideStartPage();
    loadProject(projectId);
    renderProjectList();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}