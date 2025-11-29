// ドラッグ＆ドロップモジュール

window.DragDrop = (function() {
    
    // ScheduleStateへの安全なアクセス
    function state() {
        return window.ScheduleState || {
            setDraggedElement: () => {},
            setDraggedShiftType: () => {},
            getDraggedShiftType: () => null,
            clearDragState: () => {}
        };
    }
    
    // ドラッグ&ドロップの設定
    function setupDragAndDrop() {
        // 勤務種別タイルのドラッグ開始
        const shiftTiles = document.querySelectorAll('.shift-tile');
        if (!shiftTiles || shiftTiles.length === 0) {
            console.warn('setupDragAndDrop: No shift tiles found');
            return;
        }
        shiftTiles.forEach(tile => {
            tile.addEventListener('dragstart', handleDragStart);
            tile.addEventListener('dragend', handleDragEnd);
        });
    }

    // ドラッグ開始
    function handleDragStart(e) {
        if (!e?.target) return;
        state().setDraggedElement(e.target);
        state().setDraggedShiftType(e.target.dataset?.shift);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.dataset?.shift || '');
    }

    // ドラッグ終了
    function handleDragEnd(e) {
        if (!e?.target) return;
        e.target.classList.remove('dragging');
        state().clearDragState();
        
        // すべてのセルからdrag-overクラスを削除
        document.querySelectorAll('.date-cell').forEach(cell => {
            cell.classList.remove('drag-over');
        });
    }

    // ドラッグオーバー
    function handleDragOver(e) {
        if (!e) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        e.currentTarget?.classList?.add('drag-over');
    }

    // ドラッグリーブ
    function handleDragLeave(e) {
        if (!e) return;
        e.currentTarget?.classList?.remove('drag-over');
    }

    // ドロップ
    function handleDrop(e) {
        if (!e) return;
        e.preventDefault();
        e.currentTarget?.classList?.remove('drag-over');
        
        const cell = e.currentTarget;
        if (!cell) return;
        
        // ドラッグされたシフトタイプを取得
        const shiftType = e.dataTransfer?.getData('text/plain') || state().getDraggedShiftType();
        if (!shiftType) return;
        
        // シフトを配置
        if (window.ShiftOperations?.placeShiftInCell) {
            window.ShiftOperations.placeShiftInCell(cell, shiftType);
        }
        
        // 集計を更新
        if (window.Summary?.updateSummary) {
            window.Summary.updateSummary();
        }
    }

    // セル内のシフトのドラッグ開始
    function handleShiftDragStart(e) {
        if (!e?.target) return;
        state().setDraggedElement(e.target);
        state().setDraggedShiftType(e.target.dataset?.shift);
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.dataset?.shift || '');
    }

    // セル内のシフトのドラッグ終了
    function handleShiftDragEnd(e) {
        if (!e?.target) return;
        e.target.classList.remove('dragging');
        
        // セルから削除された場合は、日付ラベルを再表示
        const cell = e.target.parentElement;
        if (cell?.classList?.contains('date-cell')) {
            const labels = cell.querySelectorAll('.date-label, .date-weekday');
            if (labels.length > 0 && !cell.querySelector('.shift-content')) {
                labels.forEach(el => {
                    el.style.display = 'block';
                });
            }
        }
        
        state().clearDragState();
        
        // すべてのセルからdrag-overクラスを削除
        document.querySelectorAll('.date-cell').forEach(cell => {
            cell.classList.remove('drag-over');
        });
    }

    // 公開API
    return {
        setupDragAndDrop: setupDragAndDrop,
        handleDragStart: handleDragStart,
        handleDragEnd: handleDragEnd,
        handleDragOver: handleDragOver,
        handleDragLeave: handleDragLeave,
        handleDrop: handleDrop,
        handleShiftDragStart: handleShiftDragStart,
        handleShiftDragEnd: handleShiftDragEnd
    };
})();

