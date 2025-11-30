// スケジュール状態管理モジュール
// グローバル状態を一元管理

window.ScheduleState = (function() {
    // プライベート変数
    let scheduleData = {}; // {staffName: {date: shiftType}}
    let draggedElement = null;
    let draggedShiftType = null;
    let isInitialized = false;

    return {
        // scheduleData アクセサ
        getScheduleData: function() {
            return scheduleData;
        },
        setScheduleData: function(data) {
            scheduleData = data;
        },
        getStaffSchedule: function(staffName) {
            return scheduleData[staffName] || {};
        },
        setStaffShift: function(staffName, date, shiftType) {
            if (!scheduleData[staffName]) {
                scheduleData[staffName] = {};
            }
            scheduleData[staffName][date] = shiftType;
        },
        removeStaffShift: function(staffName, date) {
            if (scheduleData[staffName] && scheduleData[staffName][date]) {
                delete scheduleData[staffName][date];
            }
        },
        clearAllSchedules: function() {
            scheduleData = {};
        },

        // ドラッグ状態アクセサ
        getDraggedElement: function() {
            return draggedElement;
        },
        setDraggedElement: function(element) {
            draggedElement = element;
        },
        getDraggedShiftType: function() {
            return draggedShiftType;
        },
        setDraggedShiftType: function(shiftType) {
            draggedShiftType = shiftType;
        },
        clearDragState: function() {
            draggedElement = null;
            draggedShiftType = null;
        },

        // 初期化状態アクセサ
        isInitialized: function() {
            return isInitialized;
        },
        setInitialized: function(value) {
            isInitialized = value;
        }
    };
})();


