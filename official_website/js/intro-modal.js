    (function () {
        var introSection = document.getElementById('intro');
        if (!introSection) return;

        // 初始状态：模态框关闭
        introSection.classList.add('intro-closed');

        var lastScrollY = window.scrollY;
        var scrollDir = 0;
        var ticking = false;

        // 检测滚动方向
        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                var currentY = window.scrollY;
                var delta = currentY - lastScrollY;
                if (Math.abs(delta) > 5) {
                    scrollDir = delta > 0 ? 1 : -1;
                }
                lastScrollY = currentY;
                ticking = false;
            });
        }, { passive: true });

        // 打字机相关状态
        var typingItems = introSection.querySelectorAll('.typewriter-item');
        var currentIntroState = 'intro-closed';
        var prevRatio = 0;
        var typingTimer = null;
        var typingIndex = 0;
        var cursorEl = null;

        // 逐个显示文字元素（打字机效果）
        function startTyping() {
            // 先隐藏所有
            typingItems.forEach(function (el) {
                el.classList.remove('typing-visible');
            });
            typingIndex = 0;
            clearTimeout(typingTimer);

            // 创建光标
            if (!cursorEl) {
                cursorEl = document.createElement('span');
                cursorEl.className = 'typing-cursor';
            }

            typeNext();
        }

        function typeNext() {
            if (currentIntroState !== 'intro-open') return;
            if (typingIndex >= typingItems.length) {
                // 打字完成，移除光标
                if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
                return;
            }

            var el = typingItems[typingIndex];
            el.classList.add('typing-visible');

            // 把光标附到当前元素末尾
            if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);
            el.appendChild(cursorEl);

            typingIndex++;

            // 延迟显示下一个：h3 较短 120ms，p/li 较长 180ms
            var delay = el.tagName === 'H3' ? 120 : 180;
            typingTimer = setTimeout(typeNext, delay);
        }

        // 隐藏所有文字元素（渐变消失）
        function fadeOutText() {
            clearTimeout(typingTimer);
            if (cursorEl && cursorEl.parentNode) cursorEl.parentNode.removeChild(cursorEl);

            // 从最后一个到第一个依次淡出（倒序）
            var items = Array.from(typingItems);
            var i = items.length - 1;
            function fadeNext() {
                if (i < 0) return;
                items[i].classList.remove('typing-visible');
                i--;
                setTimeout(fadeNext, 40);
            }
            fadeNext();
        }

        function setIntroState(newState) {
            if (currentIntroState === newState) return;

            var oldState = currentIntroState;
            currentIntroState = newState;

            introSection.classList.remove('intro-closed', 'intro-open', 'intro-exit');
            introSection.classList.add(newState);

            // 状态转换时的副作用
            if (newState === 'intro-open') {
                // 模态框打开 → 延迟后开始打字
                setTimeout(startTyping, 400);
            } else if (newState === 'intro-exit' || newState === 'intro-closed') {
                // 模态框关闭 → 文字淡出
                fadeOutText();
            }
        }

        // IntersectionObserver 检测
        var observer = new IntersectionObserver(function (entries) {
            var entry = entries[0];
            if (!entry) return;

            var ratio = entry.intersectionRatio;
            var isIntersecting = entry.isIntersecting;

            var ratioGoingDown = ratio < prevRatio;
            var ratioGoingUp = ratio > prevRatio;
            prevRatio = ratio;

            if (!isIntersecting || ratio < 0.02) {
                // 完全离开视口
                if (scrollDir > 0) {
                    setIntroState('intro-exit');
                } else {
                    setIntroState('intro-closed');
                }
            } else if (ratio >= 0.35) {
                if (ratioGoingUp || currentIntroState === 'intro-open') {
                    setIntroState('intro-open');
                } else if (ratioGoingDown && currentIntroState === 'intro-open') {
                    // 仍在视口但 ratio 在下降 → 提前触发离场
                    if (scrollDir > 0) {
                        setIntroState('intro-exit');
                    } else {
                        setIntroState('intro-closed');
                    }
                }
            } else if (ratio >= 0.15 && ratioGoingDown && currentIntroState === 'intro-open') {
                // 仍可见但正在离开
                if (scrollDir > 0) {
                    setIntroState('intro-exit');
                } else {
                    setIntroState('intro-closed');
                }
            } else if (ratio >= 0.2 && ratioGoingUp) {
                setIntroState('intro-open');
            }
        }, {
            threshold: [0, 0.02, 0.1, 0.15, 0.2, 0.3, 0.35, 0.5, 0.7]
        });

        observer.observe(introSection);
    })();
