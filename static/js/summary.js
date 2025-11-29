// 集計モジュール
// スケジュールの集計と表示

window.Summary = (function() {
    
    // 集計エリアを初期化
    function initializeSummary() {
        const summaryArea = document.getElementById('summary-area');
        if (!summaryArea) {
            console.warn('initializeSummary: summary-area not found');
            return;
        }
        
        // 既存の内容をクリア
        summaryArea.innerHTML = '';
        
        const dates = window.appData?.dates;
        if (!dates || !Array.isArray(dates)) {
            console.warn('initializeSummary: dates not available');
            return;
        }
        
        // 集計する勤務種別
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const dayShiftType = shiftTypesConfig.dayShift || '日勤';
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const summaryTypes = [dayShiftType, ...hour24Shifts];
        
        summaryTypes.forEach(shiftType => {
            const row = document.createElement('div');
            row.className = 'summary-row';
            row.dataset.shiftType = shiftType;
            
            // ラベルセル
            const labelCell = document.createElement('div');
            labelCell.className = 'summary-label';
            labelCell.textContent = shiftType;
            row.appendChild(labelCell);
            
            // 日付セルコンテナ
            const dateCells = document.createElement('div');
            dateCells.className = 'summary-cells';
            
            dates.forEach(dateInfo => {
                const cell = document.createElement('div');
                cell.className = 'summary-cell';
                cell.dataset.date = dateInfo.date;
                cell.dataset.shiftType = shiftType;
                cell.textContent = '0';
                dateCells.appendChild(cell);
            });
            
            row.appendChild(dateCells);
            summaryArea.appendChild(row);
        });
        
        // 初期集計を実行
        updateSummary();
    }

    // 集計を更新
    function updateSummary() {
        const dates = window.appData?.dates;
        if (!dates || !Array.isArray(dates)) return;
        
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const dayShiftType = shiftTypesConfig.dayShift || '日勤';
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const summaryTypes = [dayShiftType, ...hour24Shifts];
        
        const scheduleData = window.ScheduleState?.getScheduleData() || {};
        
        summaryTypes.forEach(shiftType => {
            dates.forEach(dateInfo => {
                if (!dateInfo?.date) return;
                const summaryCell = document.querySelector(`.summary-cell[data-date="${dateInfo.date}"][data-shift-type="${shiftType}"]`);
                if (summaryCell) {
                    // 該当日付の該当勤務種別の人数をカウント
                    let count = 0;
                    Object.keys(scheduleData).forEach(staffName => {
                        if (scheduleData[staffName]?.[dateInfo.date] === shiftType) {
                            count++;
                        }
                    });
                    summaryCell.textContent = count;
                }
            });
        });
    }

    // 公開API
    return {
        initializeSummary: initializeSummary,
        updateSummary: updateSummary
    };
})();

// グローバル関数として公開（後方互換性）
window.updateSummary = window.Summary.updateSummary;

