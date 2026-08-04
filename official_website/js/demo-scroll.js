    (function () {
        var demoSection = document.getElementById('demo');
        if (!demoSection) return;

        // 初始状态：隐藏在左侧
        demoSection.classList.add('slide-enter');

        var lastScrollY = window.scrollY;
        var scrollDir = 0;  // -1=上滚, 1=下滚
        var ticking = false;

        // 检测滚动方向
        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(function () {
                var currentY = window.scrollY;
                var delta = currentY - lastScrollY;
                // 阈值5px，避免微小滚动抖动
                if (Math.abs(delta) > 5) {
                    scrollDir = delta > 0 ? 1 : -1;
                }
                lastScrollY = currentY;
                ticking = false;
            });
        }, { passive: true });

        // 当前动画状态
        var currentSlideState = 'slide-enter';
        var prevRatio = 0;

        function setSlideState(newState) {
            if (currentSlideState === newState) return;
            demoSection.classList.remove('slide-enter', 'slide-center', 'slide-exit');
            demoSection.classList.add(newState);
            currentSlideState = newState;
        }

        var observer = new IntersectionObserver(function (entries) {
            var entry = entries[0];
            if (!entry) return;

            var ratio = entry.intersectionRatio;
            var isIntersecting = entry.isIntersecting;

            // ratio 趋势：上升=正在进入视口，下降=正在离开视口
            var ratioGoingDown = ratio < prevRatio;
            var ratioGoingUp = ratio > prevRatio;
            prevRatio = ratio;

            if (!isIntersecting || ratio < 0.02) {
                // 完全离开视口：根据滚动方向决定归位方向
                if (scrollDir > 0) {
                    setSlideState('slide-exit');
                } else {
                    setSlideState('slide-enter');
                }
            } else if (ratio >= 0.35) {
                // 充分进入视口
                if (ratioGoingUp || currentSlideState === 'slide-center') {
                    // 正在进入或已在居中 → 居中显示
                    setSlideState('slide-center');
                } else if (ratioGoingDown && currentSlideState === 'slide-center') {
                    // 曾居中但现在 ratio 在下降 → 触发离场动画（元素仍可见！）
                    if (scrollDir > 0) {
                        setSlideState('slide-exit');
                    } else {
                        setSlideState('slide-enter');
                    }
                }
            } else if (ratio >= 0.15 && ratioGoingDown && currentSlideState === 'slide-center') {
                // ratio 正在下降且仍可见 → 提前触发离场动画
                if (scrollDir > 0) {
                    setSlideState('slide-exit');
                } else {
                    setSlideState('slide-enter');
                }
            } else if (ratio >= 0.2 && ratioGoingUp) {
                // ratio 正在上升 → 进入动画
                setSlideState('slide-center');
            }
            // 其余情况保持当前状态，避免闪烁
        }, {
            threshold: [0, 0.02, 0.1, 0.15, 0.2, 0.3, 0.35, 0.5, 0.7]
        });

        observer.observe(demoSection);
    })();
