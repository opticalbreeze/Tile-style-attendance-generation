// スケジュールグリッドUIモジュール
// グリッドの生成と更新

window.ScheduleGrid = (function() {
    
    // スケジュールグリッドを初期化
    function initializeSchedule() {
        const grid = document.getElementById('schedule-grid');
        if (!grid) {
            console.error('schedule-grid要素が見つかりません');
            return;
        }
        
        if (!window.appData) {
            console.error('window.appDataが設定されていません');
            return;
        }
        
        const dates = window.appData.dates;
        const staffList = window.appData.staffList;
        
        if (!dates || !staffList) {
            console.error('appDataが正しく設定されていません', {dates, staffList});
            return;
        }
        
        // 既存の行をクリア
        grid.innerHTML = '';
        
        // 日付ヘッダーを更新
        updateDateHeaders(dates);
        
        // 各スタッフの行を生成
        staffList.forEach((staffName) => {
            const row = createStaffRow(staffName, dates);
            grid.appendChild(row);
        });
    }

    // 日付ヘッダーを更新
    function updateDateHeaders(dates) {
        const datesHeaderMonths = document.getElementById('dates-header-months');
        const datesHeaderDays = document.getElementById('dates-header-days');
        const datesHeaderWeekdays = document.getElementById('dates-header-weekdays');
        if (!datesHeaderMonths || !datesHeaderDays || !datesHeaderWeekdays) return;
        
        // 既存の内容をクリア
        datesHeaderMonths.innerHTML = '';
        datesHeaderDays.innerHTML = '';
        datesHeaderWeekdays.innerHTML = '';
        
        // 給料計算月度の月ラベルを取得
        const periodData = window.appData.periodData || {};
        const displayMonth = periodData.display_month || new Date(dates[0].date).getMonth() + 1;
        
        // 日付を月ごとにグループ化
        const monthGroups = {};
        dates.forEach((dateInfo) => {
            const date = new Date(dateInfo.date);
            const month = date.getMonth() + 1;
            if (!monthGroups[month]) {
                monthGroups[month] = [];
            }
            monthGroups[month].push({...dateInfo});
        });
        
        // 月ラベル（1行目：月名行）
        Object.keys(monthGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(month => {
            const monthDates = monthGroups[month];
            const datesInRange = monthDates.filter(d => d.day >= 16 && d.day <= 31);
            
            if (datesInRange.length > 0) {
                const monthLabelForDates = document.createElement('div');
                monthLabelForDates.className = 'month-label';
                monthLabelForDates.textContent = month + '月';
                monthLabelForDates.style.flex = `0 0 ${datesInRange.length * 45}px`;
                monthLabelForDates.style.flexShrink = '0';
                monthLabelForDates.style.flexGrow = '0';
                datesHeaderMonths.appendChild(monthLabelForDates);
            }
        });
        
        // 1-15日の上に給料計算月度の月ラベルを表示
        const currentMonthDates = monthGroups[displayMonth] || [];
        const datesInCurrentMonth = currentMonthDates.filter(d => d.day >= 1 && d.day <= 15);
        if (datesInCurrentMonth.length > 0) {
            const monthLabel = document.createElement('div');
            monthLabel.className = 'month-label';
            monthLabel.textContent = displayMonth + '月';
            monthLabel.style.flex = `0 0 ${datesInCurrentMonth.length * 45}px`;
            monthLabel.style.flexShrink = '0';
            monthLabel.style.flexGrow = '0';
            datesHeaderMonths.appendChild(monthLabel);
        }
        
        // 日付セル（2行目：日付）
        dates.forEach(dateInfo => {
            const dateCell = document.createElement('div');
            dateCell.className = 'date-header-cell date-header-day';
            dateCell.style.minWidth = '45px';
            dateCell.style.width = '45px';
            dateCell.style.flexShrink = '0';
            dateCell.style.flexGrow = '0';
            dateCell.style.padding = '4px';
            dateCell.style.textAlign = 'center';
            dateCell.style.borderRight = '1px solid #ddd';
            dateCell.style.fontSize = '10px';
            dateCell.style.fontWeight = 'bold';
            dateCell.style.color = '#333';
            
            // 土日の色付け
            if (dateInfo.weekday_jp === '土') {
                dateCell.style.backgroundColor = '#E3F2FD';
            } else if (dateInfo.weekday_jp === '日') {
                dateCell.style.backgroundColor = '#FFEBEE';
            }
            
            dateCell.textContent = dateInfo.day;
            datesHeaderDays.appendChild(dateCell);
        });
        
        // 曜日セル（3行目：曜日）
        dates.forEach(dateInfo => {
            const weekdayCell = document.createElement('div');
            weekdayCell.className = 'date-header-cell date-header-weekday';
            weekdayCell.style.minWidth = '45px';
            weekdayCell.style.width = '45px';
            weekdayCell.style.flexShrink = '0';
            weekdayCell.style.flexGrow = '0';
            weekdayCell.style.padding = '4px';
            weekdayCell.style.textAlign = 'center';
            weekdayCell.style.borderRight = '1px solid #ddd';
            weekdayCell.style.fontSize = '8px';
            weekdayCell.style.color = '#666';
            
            // 土日の色付け
            if (dateInfo.weekday_jp === '土') {
                weekdayCell.style.backgroundColor = '#E3F2FD';
                weekdayCell.style.color = '#1976D2';
            } else if (dateInfo.weekday_jp === '日') {
                weekdayCell.style.backgroundColor = '#FFEBEE';
                weekdayCell.style.color = '#C62828';
            }
            
            weekdayCell.textContent = dateInfo.weekday_jp;
            datesHeaderWeekdays.appendChild(weekdayCell);
        });
        
        // 勤務時間ヘッダーを追加
        const hoursHeaderMonth = document.createElement('div');
        hoursHeaderMonth.className = 'hours-header-cell';
        hoursHeaderMonth.textContent = '';
        datesHeaderMonths.appendChild(hoursHeaderMonth);
        
        const hoursHeaderDay = document.createElement('div');
        hoursHeaderDay.className = 'hours-header-cell';
        hoursHeaderDay.textContent = '';
        datesHeaderDays.appendChild(hoursHeaderDay);
        
        const hoursHeaderWeekday = document.createElement('div');
        hoursHeaderWeekday.className = 'hours-header-cell';
        hoursHeaderWeekday.textContent = '勤務時間';
        hoursHeaderWeekday.style.fontWeight = 'bold';
        datesHeaderWeekdays.appendChild(hoursHeaderWeekday);
    }

    // スタッフ行を作成
    function createStaffRow(staffName, dates) {
        const row = document.createElement('div');
        row.className = 'staff-row';
        row.dataset.staff = staffName;
        
        // スタッフ名セル（チェックボックス付き）
        const nameCell = document.createElement('div');
        nameCell.className = 'staff-name';
        
        // 係員チェックボックス
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `staff-exclude-${staffName}`;
        checkbox.className = 'staff-exclude-checkbox';
        checkbox.dataset.staff = staffName;
        nameCell.appendChild(checkbox);
        
        // スタッフ名ラベル
        const nameLabel = document.createElement('label');
        nameLabel.htmlFor = `staff-exclude-${staffName}`;
        nameLabel.textContent = staffName;
        nameCell.appendChild(nameLabel);
        
        row.appendChild(nameCell);
        
        // 日付セルコンテナ
        const dateCells = document.createElement('div');
        dateCells.className = 'date-cells';
        
        dates.forEach((dateInfo, index) => {
            const cell = createDateCell(staffName, dateInfo, index);
            dateCells.appendChild(cell);
        });
        
        row.appendChild(dateCells);
        
        // 勤務時間集計セルを追加
        const hoursCell = document.createElement('div');
        hoursCell.className = 'staff-hours-cell';
        hoursCell.dataset.staff = staffName;
        hoursCell.textContent = '0H';
        row.appendChild(hoursCell);
        
        return row;
    }

    // 日付セルを作成
    function createDateCell(staffName, dateInfo, index) {
        const cell = document.createElement('div');
        cell.className = 'date-cell';
        cell.dataset.staff = staffName;
        cell.dataset.date = dateInfo.date;
        cell.dataset.index = index;
        
        // 土日のクラスを追加
        if (dateInfo.weekday_jp === '土') {
            cell.classList.add('saturday');
        } else if (dateInfo.weekday_jp === '日') {
            cell.classList.add('sunday');
        }
        
        // 日付ラベル
        const dateLabel = document.createElement('div');
        dateLabel.className = 'date-label';
        dateLabel.textContent = dateInfo.day;
        
        const weekdayLabel = document.createElement('div');
        weekdayLabel.className = 'date-weekday';
        weekdayLabel.textContent = dateInfo.weekday_jp;
        
        cell.appendChild(dateLabel);
        cell.appendChild(weekdayLabel);
        
        // ドロップイベント（DragDropモジュールから設定される）
        cell.addEventListener('dragover', function(e) {
            if (window.DragDrop && window.DragDrop.handleDragOver) {
                window.DragDrop.handleDragOver(e);
            }
        });
        cell.addEventListener('dragleave', function(e) {
            if (window.DragDrop && window.DragDrop.handleDragLeave) {
                window.DragDrop.handleDragLeave(e);
            }
        });
        cell.addEventListener('drop', function(e) {
            if (window.DragDrop && window.DragDrop.handleDrop) {
                window.DragDrop.handleDrop(e);
            }
        });
        
        return cell;
    }

    // 日付セルを取得
    function getDateCell(staffName, date) {
        const staffRow = document.querySelector(`.staff-row[data-staff="${staffName}"]`);
        if (staffRow) {
            return staffRow.querySelector(`.date-cell[data-date="${date}"]`);
        }
        return null;
    }

    // 公開API
    return {
        initializeSchedule: initializeSchedule,
        updateDateHeaders: updateDateHeaders,
        createStaffRow: createStaffRow,
        createDateCell: createDateCell,
        getDateCell: getDateCell
    };
})();

// グローバル関数として公開（後方互換性）
window.getDateCell = window.ScheduleGrid.getDateCell;

