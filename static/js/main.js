// メインエントリーポイント
// アプリケーションの初期化

// 初期化
window.doInitialize = function() {
    // 既に初期化済みの場合はスキップ
    if (window.ScheduleState && window.ScheduleState.isInitialized()) {
        return;
    }
    
    if (!window.appData || !window.appData.dates || !window.appData.staffList) {
        // appDataが設定されるまで待つ
        setTimeout(window.doInitialize, 50);
        return;
    }
    
    // 初期化フラグを設定
    if (window.ScheduleState) {
        window.ScheduleState.setInitialized(true);
    }
    
    // 各モジュールの初期化
    if (window.ConstraintsUI) {
        window.ConstraintsUI.initializeDayShiftOnlyCheckboxes();
    }
    
    if (window.ScheduleGrid) {
        window.ScheduleGrid.initializeSchedule();
    }
    
    if (window.DragDrop) {
        window.DragDrop.setupDragAndDrop();
    }
    
    if (window.Summary) {
        window.Summary.initializeSummary();
    }
    
    if (window.AutoAttendController) {
        window.AutoAttendController.setupAutoAttend();
    }
    
    if (window.ShiftOperations) {
        window.ShiftOperations.initializeAllStaffHours();
    }
    
    if (window.ConstraintsUI) {
        window.ConstraintsUI.initializeConstraintsUI();
    }
};

// 後方互換性のためのグローバル変数（非推奨）
// 新しいコードはScheduleStateモジュールを使用してください
Object.defineProperty(window, 'scheduleData', {
    get: function() {
        return window.ScheduleState ? window.ScheduleState.getScheduleData() : {};
    },
    set: function(value) {
        if (window.ScheduleState) {
            window.ScheduleState.setScheduleData(value);
        }
    }
});
