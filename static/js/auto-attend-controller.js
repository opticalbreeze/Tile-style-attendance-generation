// 自動アテンドコントローラーモジュール
// 自動アテンドとリセットのUI制御

window.AutoAttendController = (function() {
    
    // 自動アテンド前の状態を保存する変数
    let savedStateBeforeAutoAttend = null;
    
    // 現在のスケジュール状態を保存
    function saveCurrentState() {
        const scheduleData = window.ScheduleState?.getScheduleData() || {};
        // ディープコピーを作成
        savedStateBeforeAutoAttend = JSON.parse(JSON.stringify(scheduleData));
        
        // 「元に戻す」ボタンを有効化
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            undoBtn.disabled = false;
        }
    }
    
    // 保存した状態に戻す
    function restoreSavedState() {
        if (!savedStateBeforeAutoAttend) {
            alert('保存された状態がありません。');
            return;
        }
        
        // 現在のスケジュールをクリア
        if (window.ShiftOperations && window.ShiftOperations.clearAllSchedules) {
            window.ShiftOperations.clearAllSchedules();
        }
        
        // 保存した状態を復元
        const dates = window.appData?.dates || [];
        const staffList = window.appData?.staffList || [];
        
        staffList.forEach(staffName => {
            dates.forEach(dateInfo => {
                const shift = savedStateBeforeAutoAttend[staffName]?.[dateInfo.date];
                if (shift) {
                    const cell = window.ScheduleGrid?.getDateCell(staffName, dateInfo.date);
                    if (cell && window.ShiftOperations?.placeShiftInCell) {
                        window.ShiftOperations.placeShiftInCell(cell, shift);
                    }
                }
            });
        });
        
        // 集計を更新
        if (window.Summary && window.Summary.updateSummary) {
            window.Summary.updateSummary();
        }
        
        // 全スタッフの勤務時間を更新
        if (window.ShiftOperations && window.ShiftOperations.initializeAllStaffHours) {
            window.ShiftOperations.initializeAllStaffHours();
        }
        
        alert('自動アテンド前の状態に戻しました。');
    }
    
    // 自動アテンド機能のセットアップ
    function setupAutoAttend() {
        const autoAttendBtn = document.getElementById('auto-attend-btn');
        if (autoAttendBtn) {
            autoAttendBtn.addEventListener('click', function() {
                if (confirm('自動アテンドを実行しますか？\n既存のスケジュール（「休」「有休」「明」以外）はクリアされます。')) {
                    // 自動アテンド前の状態を保存
                    saveCurrentState();
                    
                    // 看護師シフトアルゴリズムを使用（nurse_shift_algorithm.js）
                    // フォールバック: CSPアルゴリズム（csp_scheduler.js）
                    if (typeof nurseShiftAutoAttend === 'function') {
                        nurseShiftAutoAttend();
                    } else if (typeof cspAutoAttend === 'function') {
                        cspAutoAttend();
                    } else {
                        alert('自動アテンド機能が利用できません。ページを再読み込みしてください。');
                    }
                }
            });
        }
        
        // 元に戻すボタン
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) {
            undoBtn.addEventListener('click', function() {
                if (confirm('自動アテンド前の状態に戻しますか？')) {
                    restoreSavedState();
                }
            });
        }
        
        const resetBtn = document.getElementById('reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                if (confirm('すべてのスケジュールをリセットしますか？')) {
                    if (window.ShiftOperations && window.ShiftOperations.clearAllSchedules) {
                        window.ShiftOperations.clearAllSchedules();
                    }
                    if (window.Summary && window.Summary.updateSummary) {
                        window.Summary.updateSummary();
                    }
                    alert('すべてのスケジュールをリセットしました。');
                }
            });
        }
    }

    // 自動アテンド実行（非推奨：nurseShiftAutoAttend または cspAutoAttend を使用）
    function autoAttend() {
        console.warn('autoAttend() は非推奨です。nurseShiftAutoAttend() を使用してください。');
        if (typeof nurseShiftAutoAttend === 'function') {
            nurseShiftAutoAttend();
        } else if (typeof cspAutoAttend === 'function') {
            cspAutoAttend();
        } else {
            alert('自動アテンド機能が利用できません。');
        }
    }

    // 公開API
    return {
        setupAutoAttend: setupAutoAttend,
        autoAttend: autoAttend,
        saveCurrentState: saveCurrentState,
        restoreSavedState: restoreSavedState
    };
})();

