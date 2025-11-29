// 自動アテンドコントローラーモジュール
// 自動アテンドとリセットのUI制御

window.AutoAttendController = (function() {
    
    // 自動アテンド機能のセットアップ
    function setupAutoAttend() {
        const autoAttendBtn = document.getElementById('auto-attend-btn');
        if (autoAttendBtn) {
            autoAttendBtn.addEventListener('click', function() {
                if (confirm('自動アテンドを実行しますか？\n既存のスケジュール（「休」「有休」「明」以外）はクリアされます。')) {
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
        autoAttend: autoAttend
    };
})();

