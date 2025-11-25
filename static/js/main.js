// グローバル変数
let draggedElement = null;
let draggedShiftType = null;
let scheduleData = {}; // {staffName: {date: shiftType}}

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    initializeSchedule();
    setupDragAndDrop();
    initializeSummary();
});

// スケジュールグリッドを初期化
function initializeSchedule() {
    const grid = document.getElementById('schedule-grid');
    const dates = window.appData.dates;
    const staffList = window.appData.staffList;
    
    // 日付ヘッダーを更新
    updateDateHeaders(dates);
    
    // 各スタッフの行を生成
    staffList.forEach((staffName, index) => {
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
    dates.forEach((dateInfo, index) => {
        const date = new Date(dateInfo.date);
        const month = date.getMonth() + 1;
        if (!monthGroups[month]) {
            monthGroups[month] = [];
        }
        monthGroups[month].push({...dateInfo, index});
    });
    
    // 月ラベル（1行目：月名行）
    // 16-31日の上にその日付の月（月度の1か月前）を表示
    Object.keys(monthGroups).sort((a, b) => parseInt(a) - parseInt(b)).forEach(month => {
        const monthDates = monthGroups[month];
        const datesInRange = monthDates.filter(d => d.day >= 16 && d.day <= 31);
        
        if (datesInRange.length > 0) {
            const monthLabelForDates = document.createElement('div');
            monthLabelForDates.className = 'month-label';
            monthLabelForDates.textContent = month + '月';
            monthLabelForDates.style.flex = `0 0 ${datesInRange.length * 45}px`;
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
        datesHeaderMonths.appendChild(monthLabel);
    }
    // 日付セル（2行目：日付）
    dates.forEach(dateInfo => {
        const dateCell = document.createElement('div');
        dateCell.className = 'date-header-cell date-header-day';
        dateCell.style.minWidth = '45px';
        dateCell.style.width = '45px';
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
}

// スタッフ行を作成
function createStaffRow(staffName, dates) {
    const row = document.createElement('div');
    row.className = 'staff-row';
    row.dataset.staff = staffName;
    
    // スタッフ名セル
    const nameCell = document.createElement('div');
    nameCell.className = 'staff-name';
    nameCell.textContent = staffName;
    row.appendChild(nameCell);
    
    // 日付セルコンテナ
    const dateCells = document.createElement('div');
    dateCells.className = 'date-cells';
    
    dates.forEach((dateInfo, index) => {
        const cell = createDateCell(staffName, dateInfo, index);
        dateCells.appendChild(cell);
    });
    
    row.appendChild(dateCells);
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
    
    // ドロップイベント
    cell.addEventListener('dragover', handleDragOver);
    cell.addEventListener('dragleave', handleDragLeave);
    cell.addEventListener('drop', handleDrop);
    
    return cell;
}

// ドラッグ&ドロップの設定
function setupDragAndDrop() {
    // 勤務種別タイルのドラッグ開始
    const shiftTiles = document.querySelectorAll('.shift-tile');
    shiftTiles.forEach(tile => {
        tile.addEventListener('dragstart', handleDragStart);
        tile.addEventListener('dragend', handleDragEnd);
    });
}

// ドラッグ開始
function handleDragStart(e) {
    draggedElement = e.target;
    draggedShiftType = e.target.dataset.shift;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedShiftType);
}

// ドラッグ終了
function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedElement = null;
    draggedShiftType = null;
    
    // すべてのセルからdrag-overクラスを削除
    document.querySelectorAll('.date-cell').forEach(cell => {
        cell.classList.remove('drag-over');
    });
}

// ドラッグオーバー
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

// ドラッグリーブ
function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

// ドロップ
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const cell = e.currentTarget;
    const staffName = cell.dataset.staff;
    const date = cell.dataset.date;
    
    // ドラッグされたシフトタイプを取得
    const shiftType = e.dataTransfer.getData('text/plain') || draggedShiftType;
    if (!shiftType) return;
    
    // シフトを配置
    placeShiftInCell(cell, shiftType);
    
    // 24A、24B、または夜勤が配置された場合、翌日に自動的に「明」を配置
    if (shiftType === '24A' || shiftType === '24B' || shiftType === '夜勤') {
        autoPlaceMorningShift(staffName, date);
    }
    
    // 集計を更新
    updateSummary();
    
    draggedElement = null;
    draggedShiftType = null;
}

// セル内のシフトのドラッグ開始
function handleShiftDragStart(e) {
    draggedElement = e.target;
    draggedShiftType = e.target.dataset.shift;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedShiftType);
}

// セル内のシフトのドラッグ終了
function handleShiftDragEnd(e) {
    e.target.classList.remove('dragging');
    
    // セルから削除された場合は、日付ラベルを再表示
    const cell = e.target.parentElement;
    if (cell && cell.classList.contains('date-cell')) {
        const labels = cell.querySelectorAll('.date-label, .date-weekday');
        if (labels.length > 0 && !cell.querySelector('.shift-content')) {
            labels.forEach(el => {
                el.style.display = 'block';
            });
        }
    }
    
    draggedElement = null;
    draggedShiftType = null;
    
    // すべてのセルからdrag-overクラスを削除
    document.querySelectorAll('.date-cell').forEach(cell => {
        cell.classList.remove('drag-over');
    });
}

// セルからシフトを削除
function removeShiftFromCell(cell) {
    const shiftContent = cell.querySelector('.shift-content');
    if (shiftContent) {
        const staffName = cell.dataset.staff;
        const date = cell.dataset.date;
        const shiftType = shiftContent.dataset.shift;
        
        shiftContent.remove();
        
        // 日付ラベルを再表示
        cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
            el.style.display = 'block';
        });
        
        // データから削除
        if (scheduleData[staffName] && scheduleData[staffName][date]) {
            delete scheduleData[staffName][date];
        }
        
        // 24A/24B/夜勤が削除された場合、翌日の「明」も削除
        if (shiftType === '24A' || shiftType === '24B' || shiftType === '夜勤') {
            removeMorningShiftFromNextDay(staffName, date);
        }
        
        // 集計を更新
        updateSummary();
    }
}

// 右クリックメニューを表示
function showDeleteMenu(e, cell) {
    // 既存のメニューを削除
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    // メニューを作成
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    
    // 削除アイテムを追加
    const deleteItem = document.createElement('div');
    deleteItem.className = 'context-menu-item delete';
    deleteItem.textContent = '削除';
    deleteItem.addEventListener('click', function() {
        removeShiftFromCell(cell);
        menu.remove();
    });
    
    menu.appendChild(deleteItem);
    document.body.appendChild(menu);
    
    // メニュー外をクリックしたら閉じる
    const closeMenu = function(event) {
        if (!menu.contains(event.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
    }, 0);
}

// 24A/24Bの翌日に自動的に「明」を配置
function autoPlaceMorningShift(staffName, currentDate) {
    const dates = window.appData.dates;
    const currentDateIndex = dates.findIndex(d => d.date === currentDate);
    
    // 翌日の日付を取得
    if (currentDateIndex >= 0 && currentDateIndex < dates.length - 1) {
        const nextDate = dates[currentDateIndex + 1].date;
        
        // 同じスタッフの行で翌日のセルを見つける
        const staffRow = document.querySelector(`.staff-row[data-staff="${staffName}"]`);
        if (staffRow) {
            const nextDateCell = staffRow.querySelector(`.date-cell[data-date="${nextDate}"]`);
            if (nextDateCell) {
                // 既にシフトが配置されている場合はスキップ
                if (nextDateCell.querySelector('.shift-content')) {
                    return;
                }
                
                // 「明」を配置
                placeShiftInCell(nextDateCell, '明');
            }
        }
    }
}

// 24A/24Bが削除された場合、翌日の「明」も削除
function removeMorningShiftFromNextDay(staffName, currentDate) {
    const dates = window.appData.dates;
    const currentDateIndex = dates.findIndex(d => d.date === currentDate);
    
    // 翌日の日付を取得
    if (currentDateIndex >= 0 && currentDateIndex < dates.length - 1) {
        const nextDate = dates[currentDateIndex + 1].date;
        
        // 同じスタッフの行で翌日のセルを見つける
        const staffRow = document.querySelector(`.staff-row[data-staff="${staffName}"]`);
        if (staffRow) {
            const nextDateCell = staffRow.querySelector(`.date-cell[data-date="${nextDate}"]`);
            if (nextDateCell) {
                const shiftContent = nextDateCell.querySelector('.shift-content');
                // 「明」が配置されている場合のみ削除
                if (shiftContent && shiftContent.dataset.shift === '明') {
                    removeShiftFromCell(nextDateCell);
                }
            }
        }
    }
}

// セルにシフトを配置する共通関数
function placeShiftInCell(cell, shiftType) {
    // 既存のシフトコンテンツを削除
    const existingShift = cell.querySelector('.shift-content');
    if (existingShift) {
        existingShift.remove();
    }
    
    // 新しいシフトを追加
    const shiftContent = document.createElement('div');
    shiftContent.className = `shift-content shift-${shiftType}`;
    shiftContent.textContent = shiftType;
    shiftContent.draggable = true;
    shiftContent.dataset.shift = shiftType;
    
    // セル内のシフトもドラッグ可能にする
    shiftContent.addEventListener('dragstart', handleShiftDragStart);
    shiftContent.addEventListener('dragend', handleShiftDragEnd);
    
    // 右クリックで削除メニューを表示
    shiftContent.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showDeleteMenu(e, cell);
    });
    
    // 日付ラベルを非表示にしてシフトを表示
    cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
        el.style.display = 'none';
    });
    
    cell.appendChild(shiftContent);
    
    // データを保存
    const staffName = cell.dataset.staff;
    const date = cell.dataset.date;
    if (!scheduleData[staffName]) {
        scheduleData[staffName] = {};
    }
    scheduleData[staffName][date] = shiftType;
    
    // 集計を更新
    updateSummary();
}

// 集計エリアを初期化
function initializeSummary() {
    const summaryArea = document.getElementById('summary-area');
    if (!summaryArea) return;
    
    const dates = window.appData.dates;
    
    // 集計する勤務種別
    const summaryTypes = ['日勤', '24A', '24B', '夜勤'];
    
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
    const dates = window.appData.dates;
    const summaryTypes = ['日勤', '24A', '24B', '夜勤'];
    
    summaryTypes.forEach(shiftType => {
        dates.forEach(dateInfo => {
            const summaryCell = document.querySelector(`.summary-cell[data-date="${dateInfo.date}"][data-shift-type="${shiftType}"]`);
            if (summaryCell) {
                // 該当日付の該当勤務種別の人数をカウント
                let count = 0;
                Object.keys(scheduleData).forEach(staffName => {
                    if (scheduleData[staffName][dateInfo.date] === shiftType) {
                        count++;
                    }
                });
                summaryCell.textContent = count;
            }
        });
    });
}
