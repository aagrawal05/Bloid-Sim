/**
 * Details drawer: collapse toggle and drag-to-resize behaviour.
 * Persists width to localStorage.
 */
(function () {
    var STORAGE_KEY = 'bloidDetailsDrawerWidth';
    var MIN_WIDTH = 200;
    var MAX_WIDTH = 500;
    var DEFAULT_WIDTH = 280;
    var COLLAPSED_WIDTH = 48;

    function getStoredWidth() {
        var s = localStorage.getItem(STORAGE_KEY);
        var n = parseInt(s, 10);
        return (n >= MIN_WIDTH && n <= MAX_WIDTH) ? n : DEFAULT_WIDTH;
    }
    function setStoredWidth(w) {
        localStorage.setItem(STORAGE_KEY, String(Math.round(w)));
    }

    var drawer = document.getElementById('detailsDrawer');
    var toggle = document.getElementById('detailsDrawerToggle');
    var resizeHandle = document.getElementById('detailsDrawerResize');

    if (drawer && toggle) {
        drawer.style.width = getStoredWidth() + 'px';

        toggle.addEventListener('click', function () {
            var collapsed = drawer.classList.toggle('details-drawer--collapsed');
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggle.title = collapsed ? 'Show details panel' : 'Hide details panel';
            drawer.style.width = collapsed ? COLLAPSED_WIDTH + 'px' : getStoredWidth() + 'px';
        });

        if (resizeHandle) {
            var dragStartX = 0;
            var dragStartWidth = 0;

            resizeHandle.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                if (drawer.classList.contains('details-drawer--collapsed')) return;
                e.preventDefault();
                dragStartX = e.clientX;
                dragStartWidth = drawer.offsetWidth;
                document.body.classList.add('details-drawer--resizing');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';

                function onMove(e) {
                    var deltaX = dragStartX - e.clientX;
                    var newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragStartWidth + deltaX));
                    drawer.style.width = newWidth + 'px';
                }
                function onUp() {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    document.body.classList.remove('details-drawer--resizing');
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    setStoredWidth(drawer.offsetWidth);
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }
    }
})();
