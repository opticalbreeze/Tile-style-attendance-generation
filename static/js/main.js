// グローバル変数
let draggedElement = null;
let draggedShiftType = null;
let scheduleData = {}; // {staffName: {date: shiftType}}

// 初期化フラグ
let isInitialized = false;

// 初期化
window.doInitialize = function() {
    // 既に初期化済みの場合はスキップ
    if (isInitialized) {
        return;
    }
    
    if (!window.appData || !window.appData.dates || !window.appData.staffList) {
        // appDataが設定されるまで待つ
        setTimeout(window.doInitialize, 50);
        return;
    }
    
    // 初期化フラグを設定
    isInitialized = true;
    
    initializeDayShiftOnlyCheckboxes();
    initializeSchedule();
    setupDragAndDrop();
    initializeSummary();
    setupAutoAttend();
    initializeAllStaffHours();
};

// 日勤専門チェックボックスを初期化
function initializeDayShiftOnlyCheckboxes() {
    const container = document.getElementById('day-shift-only-checkboxes');
    if (!container) return;
    
    const config = window.appData?.config || {};
    const dayShiftOnlyCount = config.staff?.dayShiftOnlyCount || 3;
    const staffList = window.appData?.staffList || [];
    
    container.innerHTML = '';
    for (let i = 0; i < Math.min(dayShiftOnlyCount, staffList.length); i++) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `day-shift-only-${i + 1}`;
        checkbox.checked = true;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${i + 1}位: 日勤専門`));
        container.appendChild(label);
    }
}

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
    
    // シフトを配置（placeShiftInCell内で自動的に「明」が配置される）
    placeShiftInCell(cell, shiftType);
    
    // 集計を更新
    updateSummary();
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

// シフトタイプから勤務時間を取得
function getShiftHours(shiftType) {
    const config = window.appData?.config;
    if (config && config.shiftHours && config.shiftHours[shiftType] !== undefined) {
        return config.shiftHours[shiftType];
    }
    return 0;
}

// スタッフの勤務時間を計算
function calculateStaffHours(staffName) {
    const dates = window.appData.dates;
    if (!dates) return 0;
    
    let totalHours = 0;
    dates.forEach(dateInfo => {
        const shiftType = scheduleData[staffName] && scheduleData[staffName][dateInfo.date];
        if (shiftType) {
            totalHours += getShiftHours(shiftType);
        }
    });
    
    return totalHours;
}

// スタッフの勤務時間を計算して更新
function updateStaffHours(staffName) {
    const hoursCell = document.querySelector(`.staff-hours-cell[data-staff="${staffName}"]`);
    if (!hoursCell) return;
    
    const totalHours = calculateStaffHours(staffName);
    hoursCell.textContent = totalHours + 'H';
}

// 全スタッフの勤務時間を初期化
function initializeAllStaffHours() {
    const staffList = window.appData?.staffList || [];
    staffList.forEach(staffName => {
        updateStaffHours(staffName);
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
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        if (hour24Shifts.includes(shiftType)) {
            removeMorningShiftFromNextDay(staffName, date);
        }
        
        // 勤務時間を更新
        updateStaffHours(staffName);
        
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
                const config = window.appData?.config || {};
                const shiftTypesConfig = config.shiftTypes || {};
                const morningShift = shiftTypesConfig.morningShift || '明';
                const restShift = shiftTypesConfig.rest || '休';
                const paidLeaveShift = shiftTypesConfig.paidLeave || '有休';
                
                // 既にシフトが配置されている場合
                const existingShift = nextDateCell.querySelector('.shift-content');
                if (existingShift) {
                    const existingShiftType = existingShift.dataset.shift;
                    // 「休」「有休」が既に配置されている場合はスキップ（希望休として保持）
                    if (existingShiftType === restShift || existingShiftType === paidLeaveShift) {
                        return;
                    }
                    // 既に「明」が配置されている場合はスキップ
                    if (existingShiftType === morningShift) {
                        return;
                    }
                    // その他のシフト（日勤など）が配置されている場合は「明」に上書き
                }
                
                // 「明」を配置（既存のシフトを上書き）
                placeShiftInCell(nextDateCell, morningShift);
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
                const config = window.appData?.config || {};
                const shiftTypesConfig = config.shiftTypes || {};
                const morningShift = shiftTypesConfig.morningShift || '明';
                if (shiftContent && shiftContent.dataset.shift === morningShift) {
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
    
    // 24A、24B、または夜勤が配置された場合、翌日に自動的に「明」を配置
    const config = window.appData?.config || {};
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    if (hour24Shifts.includes(shiftType)) {
        autoPlaceMorningShift(staffName, date);
    }
    
    // 勤務時間を更新
    updateStaffHours(staffName);
    
    // 集計を更新
    updateSummary();
}

// 集計エリアを初期化
function initializeSummary() {
    const summaryArea = document.getElementById('summary-area');
    if (!summaryArea) return;
    
    // 既存の内容をクリア
    summaryArea.innerHTML = '';
    
    const dates = window.appData.dates;
    if (!dates) return;
    
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
    const dates = window.appData.dates;
    const config = window.appData?.config || {};
    const shiftTypesConfig = config.shiftTypes || {};
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const summaryTypes = [dayShiftType, ...hour24Shifts];
    
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

// 自動アテンド機能のセットアップ
function setupAutoAttend() {
    const autoAttendBtn = document.getElementById('auto-attend-btn');
    if (autoAttendBtn) {
        autoAttendBtn.addEventListener('click', function() {
            if (confirm('CSPアルゴリズムによる自動アテンドを実行しますか？\n既存のスケジュール（「休」「有休」以外）はすべてクリアされます。')) {
                // CSPアルゴリズムを使用（看護師シフト生成に最適化）
                if (typeof cspAutoAttend === 'function') {
                    cspAutoAttend();
                } else if (typeof optimizedAutoAttend === 'function') {
                    optimizedAutoAttend();
                } else {
                    // フォールバック：従来のアルゴリズム
                    autoAttend();
                }
            }
        });
    }
    
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            if (confirm('すべてのスケジュールをリセットしますか？')) {
                clearAllSchedules();
                updateSummary();
                alert('すべてのスケジュールをリセットしました。');
            }
        });
    }
}

// 自動アテンド実行
function autoAttend() {
    const dates = window.appData.dates;
    const staffList = window.appData.staffList;
    
    if (!dates || !staffList) {
        alert('データが正しく読み込まれていません。ページを再読み込みしてください。');
        return;
    }
    
    // 係員チェックボックスで除外されたスタッフを取得
    const excludedStaff = [];
    staffList.forEach(staff => {
        const excludeCheckbox = document.getElementById(`staff-exclude-${staff}`);
        if (excludeCheckbox && excludeCheckbox.checked) {
            excludedStaff.push(staff);
        }
    });
    
    // 日勤専門スタッフを取得（係員除外リストに含まれていないもの）
    const config = window.appData?.config || {};
    const dayShiftOnlyCount = config.staff?.dayShiftOnlyCount || 3;
    const dayShiftOnlyStaff = [];
    for (let i = 0; i < Math.min(dayShiftOnlyCount, staffList.length); i++) {
        const checkbox = document.getElementById(`day-shift-only-${i + 1}`);
        if (checkbox && checkbox.checked && !excludedStaff.includes(staffList[i])) {
            dayShiftOnlyStaff.push(staffList[i]);
        }
    }
    
    // 24時間交代勤務スタッフ（日勤専門以外、係員除外リストにも含まれていないもの）
    const shiftStaff = staffList.filter(staff => 
        !dayShiftOnlyStaff.includes(staff) && !excludedStaff.includes(staff)
    );
    
    // 前月15日のシフトを確認し、24A/24B/夜勤の場合、16日に「明」を配置
    const periodData = window.appData.periodData || {};
    const startDate = periodData.start_date;
    if (startDate && dates.length > 0) {
        // 前月15日の日付を計算（開始日の前日）
        const startDateObj = new Date(startDate + 'T00:00:00');
        startDateObj.setDate(startDateObj.getDate() - 1);
        const prevMonth15th = startDateObj.toISOString().split('T')[0]; // YYYY-MM-DD形式
        
        // 16日（開始日、最初の日付）の日付
        const firstDate = dates[0].date;
        
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const morningShift = shiftTypesConfig.morningShift || '明';
        
        staffList.forEach(staffName => {
            // 前月15日のシフトを確認
            // まずscheduleDataから確認
            let prevMonth15thShift = scheduleData[staffName] && scheduleData[staffName][prevMonth15th];
            
            // scheduleDataにない場合は、localStorageから確認
            if (!prevMonth15thShift) {
                try {
                    const savedData = localStorage.getItem('scheduleData');
                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        prevMonth15thShift = parsedData[staffName] && parsedData[staffName][prevMonth15th];
                    }
                } catch (e) {
                    // localStorageの読み込みに失敗した場合は無視
                }
            }
            
            // 前月15日が24A/24B/夜勤の場合、16日に「明」を配置
            if (prevMonth15thShift && hour24Shifts.includes(prevMonth15thShift)) {
                const firstDateCell = getDateCell(staffName, firstDate);
                if (firstDateCell) {
                    // 既にシフトが配置されている場合はスキップ（希望休など）
                    const existingShift = firstDateCell.querySelector('.shift-content');
                    if (!existingShift) {
                        placeShiftInCell(firstDateCell, morningShift);
                    }
                }
            }
        });
    }
    
    // 既存の「休」「有休」を保存（希望休として保持）
    const savedRestDays = {};
    staffList.forEach(staffName => {
        dates.forEach(dateInfo => {
            const cell = getDateCell(staffName, dateInfo.date);
            if (cell) {
                const shiftContent = cell.querySelector('.shift-content');
                if (shiftContent) {
                    const shiftType = shiftContent.dataset.shift;
                    if (shiftType === '休' || shiftType === '有休') {
                        if (!savedRestDays[staffName]) {
                            savedRestDays[staffName] = {};
                        }
                        savedRestDays[staffName][dateInfo.date] = shiftType;
                    }
                }
            }
        });
    });
    
    // 既存のスケジュールをクリア（「休」「有休」以外）
    clearAllSchedulesExceptRest(savedRestDays);
    
    // 保存した「休」「有休」を復元
    Object.keys(savedRestDays).forEach(staffName => {
        Object.keys(savedRestDays[staffName]).forEach(date => {
            const cell = getDateCell(staffName, date);
            if (cell) {
                const shiftType = savedRestDays[staffName][date];
                placeShiftInCell(cell, shiftType);
            }
        });
    });
    
    // スタッフ行が存在するか確認し、なければ再生成
    const grid = document.getElementById('schedule-grid');
    if (grid && grid.children.length === 0) {
        initializeSchedule();
        // 再度「休」「有休」を復元
        Object.keys(savedRestDays).forEach(staffName => {
            Object.keys(savedRestDays[staffName]).forEach(date => {
                const cell = getDateCell(staffName, date);
                if (cell) {
                    const shiftType = savedRestDays[staffName][date];
                    placeShiftInCell(cell, shiftType);
                }
            });
        });
    }
    
    // 各スタッフの勤務回数をカウント（バランス用）
    const shiftTypesConfig = config.shiftTypes || {};
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    
    const shiftCounts = {};
    staffList.forEach(staff => {
        shiftCounts[staff] = {};
        hour24Shifts.forEach(shiftType => {
            shiftCounts[staff][shiftType] = 0;
        });
        shiftCounts[staff][dayShiftType] = 0;
    });
    
    // 月全体の最適化：各スタッフの目標労働時間を計算
    const targetHoursMax = 168; // 月168時間を上限とする
    const shift24Hours = 16; // 24A/24Bは16時間
    const dayShiftHours = 8; // 日勤は8時間
    
    // 月全体で必要な24勤の回数を計算
    const requiredStaff = config.requiredStaff || {};
    const weekdayReq = requiredStaff.weekday || { dayShift: 3, nightShift: 3 };
    const weekendReq = requiredStaff.weekend || { nightShift: 3 };
    
    let total24ShiftNeeded = 0;
    dates.forEach(dateInfo => {
        const weekday = dateInfo.weekday_jp;
        const isWeekend = weekday === '土' || weekday === '日';
        if (isWeekend) {
            total24ShiftNeeded += weekendReq.nightShift || 3;
        } else {
            total24ShiftNeeded += weekdayReq.nightShift || 3;
        }
    });
    
    // 各スタッフの目標24勤回数を計算（均等に配分、168時間以内）
    const target24ShiftCount = {};
    const availableStaffCount = shiftStaff.length;
    if (availableStaffCount > 0) {
        const base24Shifts = Math.floor(total24ShiftNeeded / availableStaffCount);
        const remainder = total24ShiftNeeded % availableStaffCount;
        
        shiftStaff.forEach((staff, index) => {
            // 基本回数 + 余りを均等に配分
            let targetCount = base24Shifts;
            if (index < remainder) {
                targetCount++;
            }
            
            // 168時間以内に収まるように調整
            // 24勤1回 = 16時間、最大10回（160時間）+ 日勤1回（8時間）= 168時間
            const max24Shifts = Math.floor(targetHoursMax / shift24Hours); // 10回
            targetCount = Math.min(targetCount, max24Shifts);
            
            target24ShiftCount[staff] = targetCount;
        });
    }
    
    // 日付ごとに処理
    dates.forEach((dateInfo, dateIndex) => {
        const date = new Date(dateInfo.date);
        const weekday = dateInfo.weekday_jp;
        const isWeekend = weekday === '土' || weekday === '日';
        
        const config = window.appData?.config || {};
        const requiredStaff = config.requiredStaff || {};
        const weekdayReq = requiredStaff.weekday || { dayShift: 3, nightShift: 3 };
        const weekendReq = requiredStaff.weekend || { nightShift: 3 };
        const shiftTypes = config.shiftTypes || {};
        const restShift = shiftTypes.rest || '休';
        const dayShiftType = shiftTypes.dayShift || '日勤';
        // 夜勤を除外して24A/24Bのみ
        const nightShiftTypes = ['24A', '24B'];
        
        if (isWeekend) {
            // 土日：24勤を配置
            const requiredNightShift = weekendReq.nightShift || 3;
            assignShiftWorkers(dateInfo.date, shiftStaff, nightShiftTypes, requiredNightShift, shiftCounts, dateIndex, target24ShiftCount);
            
            // 日勤専門スタッフは休み（希望休が既に配置されている場合はスキップ）
            dayShiftOnlyStaff.forEach(staff => {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    const existingShift = cell.querySelector('.shift-content');
                    if (!existingShift) {
                        placeShiftInCell(cell, restShift);
                    }
                }
            });
        } else {
            // 平日：日勤と24勤を配置
            const requiredDayShift = weekdayReq.dayShift || 3;
            const requiredNightShift = weekdayReq.nightShift || 3;
            
            // 日勤専門スタッフから日勤を配置
            const dayShiftAssignments = assignDayShiftWorkers(dateInfo.date, dayShiftOnlyStaff, requiredDayShift);
            
            // 残りの日勤を交代勤務スタッフから配置
            const remainingDayShift = requiredDayShift - dayShiftAssignments;
            if (remainingDayShift > 0) {
                assignShiftWorkers(dateInfo.date, shiftStaff, [dayShiftType], remainingDayShift, shiftCounts, dateIndex, target24ShiftCount);
            }
            
            // 24勤を配置
            assignShiftWorkers(dateInfo.date, shiftStaff, nightShiftTypes, requiredNightShift, shiftCounts, dateIndex, target24ShiftCount);
        }
    });
    
    // 集計を更新
    updateSummary();
    
    alert('自動アテンドが完了しました。');
}

// 日勤専門スタッフに日勤を割り当て
function assignDayShiftWorkers(date, staffList, requiredCount) {
    let assigned = 0;
    staffList.forEach(staff => {
        if (assigned < requiredCount) {
            const cell = getDateCell(staff, date);
            if (cell) {
                // 「休」「有休」が既に配置されている場合はスキップ
                const existingShift = cell.querySelector('.shift-content');
                if (existingShift) {
                    const existingShiftType = existingShift.dataset.shift;
                    if (existingShiftType === '休' || existingShiftType === '有休') {
                        return; // スキップ
                    }
                }
                
                if (!existingShift) {
                    placeShiftInCell(cell, '日勤');
                    assigned++;
                }
            }
        }
    });
    return assigned;
}

// シフトタイプを選択する共通関数
function selectShiftType(shiftTypes, shiftTypeCounter) {
    if (shiftTypes.length === 2 && shiftTypes.includes('24A') && shiftTypes.includes('24B')) {
        return {
            shiftType: shiftTypeCounter % 2 === 0 ? '24A' : '24B',
            counterIncrement: 1
        };
    } else if (shiftTypes.includes('日勤')) {
        return {
            shiftType: '日勤',
            counterIncrement: 1
        };
    } else {
        return {
            shiftType: shiftTypes[shiftTypeCounter % shiftTypes.length],
            counterIncrement: 1
        };
    }
}

// 交代勤務スタッフにシフトを割り当て
function assignShiftWorkers(date, staffList, shiftTypes, requiredCount, shiftCounts, dateIndex, target24ShiftCount = {}) {
    const dates = window.appData.dates;
    
    // 24時間交代勤務の労働時間上限
    const targetHoursMax = 168; // 月168時間を上限とする
    
    // 前日と前々日のシフトを確認
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    const prevShifts = {};
    const prevPrevShifts = {};
    
    if (prevDate) {
        staffList.forEach(staff => {
            const prevCell = getDateCell(staff, prevDate);
            if (prevCell) {
                const prevShift = prevCell.querySelector('.shift-content');
                if (prevShift) {
                    prevShifts[staff] = prevShift.dataset.shift;
                }
            }
        });
    }
    
    if (prevPrevDate) {
        staffList.forEach(staff => {
            const prevPrevCell = getDateCell(staff, prevPrevDate);
            if (prevPrevCell) {
                const prevPrevShift = prevPrevCell.querySelector('.shift-content');
                if (prevPrevShift) {
                    prevPrevShifts[staff] = prevPrevShift.dataset.shift;
                }
            }
        });
    }
    
    // 現在の日付のセルを確認（「休」「有休」を避ける）
    const currentShifts = {};
    staffList.forEach(staff => {
        const cell = getDateCell(staff, date);
        if (cell) {
            const shiftContent = cell.querySelector('.shift-content');
            if (shiftContent) {
                currentShifts[staff] = shiftContent.dataset.shift;
            }
        }
    });
    
    // 全スタッフの平均労働時間を計算（労働時間均等化のため）
    // 係員除外チェックボックスで除外されたスタッフは計算から除外
    let totalHoursAll = 0;
    let staffCount = 0;
    const excludedStaff = [];
    staffList.forEach(staff => {
        const excludeCheckbox = document.getElementById(`staff-exclude-${staff}`);
        if (excludeCheckbox && excludeCheckbox.checked) {
            excludedStaff.push(staff);
            return; // 計算から除外
        }
        const hours = calculateStaffHours(staff);
        totalHoursAll += hours;
        staffCount++;
    });
    const averageHours = staffCount > 0 ? totalHoursAll / staffCount : 0;
    
    // 各スタッフの優先度を計算
    const priorities = staffList.map(staff => {
        // 係員除外チェックボックスで除外されたスタッフは自動アテンドから除外
        const excludeCheckbox = document.getElementById(`staff-exclude-${staff}`);
        if (excludeCheckbox && excludeCheckbox.checked) {
            return {
                staff: staff,
                priority: 99999,
                totalShifts: 99999,
                prevShift: '',
                canAssign: false
            };
        }
        
        const prevShift = prevShifts[staff] || '';
        const prevPrevShift = prevPrevShifts[staff] || '';
        const currentShift = currentShifts[staff] || '';
        
        // 「休」「有休」が既に配置されている場合は除外
        if (currentShift === '休' || currentShift === '有休') {
            return {
                staff: staff,
                priority: 9999,
                totalShifts: 9999,
                prevShift: prevShift,
                canAssign: false
            };
        }
        
        // 24勤を配置する場合のチェック
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const morningShift = shiftTypesConfig.morningShift || '明';
        const is24ShiftType = shiftTypes.some(type => hour24Shifts.includes(type));
        
        if (is24ShiftType) {
            // 前日が24A/24B/夜勤の場合、今日は「明」が入るので、今日に24勤を配置してはいけない
            const isPrev24Shift = hour24Shifts.includes(prevShift);
            if (isPrev24Shift) {
                return {
                    staff: staff,
                    priority: 5000,
                    totalShifts: 5000,
                    prevShift: prevShift,
                    canAssign: false
                };
            }
            
            // 前々日が24A/24B/夜勤 AND 前日が「明」の場合、今日は24勤禁止
            // これにより、24勤→明→24勤→明のパターンが可能になる
            // ただし、前日が「明」で前々日が24勤でない場合は、今日に24勤を配置可能
            const isAfterMorning = hour24Shifts.includes(prevPrevShift) && prevShift === morningShift;
            if (isAfterMorning) {
                return {
                    staff: staff,
                    priority: 5000,
                    totalShifts: 5000,
                    prevShift: prevShift,
                    canAssign: false
                };
            }
            
            // 前日が「明」で前々日が24勤でない場合は、今日に24勤を配置可能（24勤→明→24勤のパターン）
        }
        
        const penalties = config.penalties || {};
        const continuousPenalty = penalties.continuousShift || 1000;
        const hoursMultiplier = penalties.hoursDifferenceMultiplier || 100;
        
        const isContinuous = hour24Shifts.includes(prevShift);
        const dayShiftType = shiftTypesConfig.dayShift || '日勤';
        let totalShifts = shiftCounts[staff][dayShiftType] || 0;
        hour24Shifts.forEach(shiftType => {
            totalShifts += shiftCounts[staff][shiftType] || 0;
        });
        
        // 労働時間を計算（希望休も含む）
        const currentHours = calculateStaffHours(staff);
        
        // 24時間交代勤務（24A/24B）の場合の労働時間制約チェック（最適化版）
        if (is24ShiftType && (shiftTypes.includes('24A') || shiftTypes.includes('24B'))) {
            // シフトを割り当てた場合の労働時間を計算
            const shiftHours = getShiftHours(shiftTypes[0]); // 割り当て予定のシフト時間（16時間）
            const futureHours = currentHours + shiftHours;
            
            // 168時間を超える場合は割り当て不可
            if (futureHours > targetHoursMax) {
                return {
                    staff: staff,
                    priority: 99999,
                    totalShifts: 99999,
                    totalHours: currentHours,
                    prevShift: prevShift,
                    canAssign: false
                };
            }
            
            // 目標24勤回数と現在の24勤回数を比較
            const current24ShiftCount = (shiftCounts[staff]['24A'] || 0) + (shiftCounts[staff]['24B'] || 0);
            const targetCount = (target24ShiftCount && target24ShiftCount[staff]) ? target24ShiftCount[staff] : 0;
            const remaining24Shifts = targetCount - current24ShiftCount;
            
            // 残りの日数と必要な24勤回数を考慮
            const remainingDays = dates.length - dateIndex;
            const remaining24ShiftsNeeded = remaining24Shifts;
            
            // 目標回数に達していない場合、残りの日数で達成可能かチェック
            if (remaining24ShiftsNeeded > 0 && remainingDays >= remaining24ShiftsNeeded) {
                // 目標回数に達していない場合、優先度を上げる
                // 目標回数に近いほど優先度を下げる（均等に配分）
                const progressRatio = current24ShiftCount / Math.max(targetCount, 1);
                const hoursProgress = currentHours / targetHoursMax;
                
                // 目標回数に達していない場合、少ないほど優先
                // ただし、残りの日数で達成可能な場合のみ
                if (remaining24ShiftsNeeded <= remainingDays) {
                    return {
                        staff: staff,
                        priority: -100000 - (remaining24ShiftsNeeded * 10000) + (targetHoursMax - currentHours) * 10,
                        totalShifts: totalShifts,
                        totalHours: currentHours,
                        prevShift: prevShift,
                        canAssign: true
                    };
                }
            }
            
            // 目標回数に達している場合でも、168時間以内なら割り当て可能にする
            // ただし、優先度を下げる（必要な人数を満たすために使用）
            if (remaining24ShiftsNeeded <= 0) {
                // 目標回数に達しているが、168時間以内なら割り当て可能（優先度を下げる）
                if (current24ShiftCount >= targetCount) {
                    // 168時間を超える場合は割り当て不可
                    if (futureHours > targetHoursMax) {
                        return {
                            staff: staff,
                            priority: 99999,
                            totalShifts: totalShifts,
                            totalHours: currentHours,
                            prevShift: prevShift,
                            canAssign: false
                        };
                    }
                    // 目標回数を超えているが、168時間以内なら割り当て可能（優先度を下げる）
                    return {
                        staff: staff,
                        priority: 50000 + (current24ShiftCount - targetCount) * 1000,
                        totalShifts: totalShifts,
                        totalHours: currentHours,
                        prevShift: prevShift,
                        canAssign: true
                    };
                }
            }
            
            // 残りの日数で達成不可能な場合でも、168時間以内なら割り当て可能
            if (remaining24ShiftsNeeded > remainingDays) {
                // 168時間を超える場合は割り当て不可
                if (futureHours > targetHoursMax) {
                    return {
                        staff: staff,
                        priority: 99999,
                        totalShifts: totalShifts,
                        totalHours: currentHours,
                        prevShift: prevShift,
                        canAssign: false
                    };
                }
                // 残りの日数で達成不可能だが、168時間以内なら割り当て可能（優先度を下げる）
                return {
                    staff: staff,
                    priority: 40000 + (remaining24ShiftsNeeded - remainingDays) * 1000,
                    totalShifts: totalShifts,
                    totalHours: currentHours,
                    prevShift: prevShift,
                    canAssign: true
                };
            }
            
            // 労働時間が少ないスタッフを優先（168時間に近づける）
            const hoursRemaining = targetHoursMax - currentHours;
            if (hoursRemaining >= shiftHours) {
                return {
                    staff: staff,
                    priority: -50000 + (targetHoursMax - currentHours) * 100,
                    totalShifts: totalShifts,
                    totalHours: currentHours,
                    prevShift: prevShift,
                    canAssign: true
                };
            } else {
                return {
                    staff: staff,
                    priority: 10000 + (currentHours - (targetHoursMax - shiftHours)) * 1000,
                    totalShifts: totalShifts,
                    totalHours: currentHours,
                    prevShift: prevShift,
                    canAssign: true
                };
            }
        }
        
        // その他の場合は平均からの差で計算
        const hoursDifference = currentHours - averageHours;
        const hoursPenalty = hoursDifference * hoursMultiplier;
        
        // 連続勤務のペナルティと労働時間のペナルティを組み合わせ
        const basePriority = isContinuous ? continuousPenalty : 0;
        const priority = basePriority + hoursPenalty;
        
        return {
            staff: staff,
            priority: priority,
            totalShifts: totalShifts,
            totalHours: currentHours,
            prevShift: prevShift,
            canAssign: true
        };
    });
    
    // 優先度順にソート
    priorities.sort((a, b) => a.priority - b.priority);
    
    // 24時間交代勤務かどうかを判定（関数スコープで定義）
    const config = window.appData?.config || {};
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const is24ShiftType = shiftTypes.some(type => hour24Shifts.includes(type));
    
    // シフトを割り当て
    let assigned = 0;
    let shiftTypeCounter = 0;
    
    priorities.forEach(({staff, prevShift, canAssign}) => {
        if (assigned < requiredCount && canAssign !== false) {
            const cell = getDateCell(staff, date);
            if (cell) {
                // 「休」「有休」が既に配置されている場合はスキップ
                const existingShift = cell.querySelector('.shift-content');
                if (existingShift) {
                    const existingShiftType = existingShift.dataset.shift;
                    if (existingShiftType === '休' || existingShiftType === '有休') {
                        return; // スキップ
                    }
                }
                
                if (!existingShift) {
                    // 連続勤務を避ける
                    const config = window.appData?.config || {};
                    const shiftTypesConfig = config.shiftTypes || {};
                    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
                    const morningShift = shiftTypesConfig.morningShift || '明';
                    const isPrev24Shift = hour24Shifts.includes(prevShift);
                    const prevPrevShift = prevPrevShifts[staff] || '';
                    const isPrevPrev24Shift = prevPrevShift && hour24Shifts.includes(prevPrevShift);
                    
                    // 前日が24勤の場合は24勤を配置不可（今日は「明」が入る）
                    // 前日が「明」で前々日が24勤の場合は24勤を配置不可（連続勤務を避ける）
                    // それ以外の場合は24勤を配置可能（24勤→明→24勤のパターン）
                    const canAssign24Shift = !isPrev24Shift && !(prevShift === morningShift && isPrevPrev24Shift);
                    
                    if ((canAssign24Shift && is24ShiftType) || shiftTypes.includes('日勤')) {
                        // シフトタイプをローテーション（24A/24Bを交互に）
                        let shiftType;
                        if (shiftTypes.length === 2 && shiftTypes.includes('24A') && shiftTypes.includes('24B')) {
                            shiftType = shiftTypeCounter % 2 === 0 ? '24A' : '24B';
                            shiftTypeCounter++;
                        } else if (shiftTypes.includes('日勤')) {
                            shiftType = '日勤';
                        } else {
                            shiftType = shiftTypes[shiftTypeCounter % shiftTypes.length];
                            shiftTypeCounter++;
                        }
                        
                        // 24時間交代勤務（24A/24B）の場合、労働時間制約をチェック
                        if ((shiftType === '24A' || shiftType === '24B')) {
                            const currentHours = calculateStaffHours(staff);
                            const shiftHours = getShiftHours(shiftType);
                            const futureHours = currentHours + shiftHours;
                            
                            // 168時間を超える場合は割り当てをスキップ
                            if (futureHours > targetHoursMax) {
                                return; // スキップ
                            }
                        }
                        
                        placeShiftInCell(cell, shiftType);
                        
                        // 24A/24B/夜勤の場合は翌日に「明」が自動配置される（placeShiftInCell内で処理）
                        
                        // カウントを更新
                        if (shiftCounts[staff][shiftType] !== undefined) {
                            shiftCounts[staff][shiftType]++;
                        }
                        
                        assigned++;
                    }
                }
            }
        }
    });
    
    // 必要な人数に達しない場合は、労働時間制約を守りながら割り当て（ただし「休」「有休」は避ける）
    if (assigned < requiredCount) {
        // 24時間交代勤務かどうかを判定
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const is24ShiftType = shiftTypes.some(type => hour24Shifts.includes(type));
        
        // 労働時間制約を守れるスタッフのみを対象とする
        // canAssign: falseでも、168時間以内なら割り当て可能にする
        const availableStaff = priorities.filter(({staff, totalHours}) => {
            // 24時間交代勤務（24A/24B）の場合、労働時間制約をチェック
            if (is24ShiftType && (shiftTypes.includes('24A') || shiftTypes.includes('24B'))) {
                const currentHours = totalHours || calculateStaffHours(staff);
                const shiftHours = getShiftHours(shiftTypes[0]);
                const futureHours = currentHours + shiftHours;
                
                // 168時間を超える場合は除外
                if (futureHours > targetHoursMax) {
                    return false;
                }
            }
            
            return true;
        });
        
        availableStaff.forEach(({staff, prevShift}) => {
            if (assigned < requiredCount) {
                const cell = getDateCell(staff, date);
                if (cell) {
                    // 「休」「有休」が既に配置されている場合はスキップ
                    const existingShift = cell.querySelector('.shift-content');
                    if (existingShift) {
                        const existingShiftType = existingShift.dataset.shift;
                        if (existingShiftType === '休' || existingShiftType === '有休') {
                            return; // スキップ
                        }
                    }
                    
                    if (!existingShift) {
                        let shiftType;
                        if (shiftTypes.length === 2 && shiftTypes.includes('24A') && shiftTypes.includes('24B')) {
                            shiftType = shiftTypeCounter % 2 === 0 ? '24A' : '24B';
                            shiftTypeCounter++;
                        } else if (shiftTypes.includes('日勤')) {
                            shiftType = '日勤';
                        } else {
                            shiftType = shiftTypes[shiftTypeCounter % shiftTypes.length];
                            shiftTypeCounter++;
                        }
                        
                        // 24時間交代勤務（24A/24B）の場合、労働時間制約を再チェック
                        if ((shiftType === '24A' || shiftType === '24B')) {
                            const currentHours = calculateStaffHours(staff);
                            const shiftHours = getShiftHours(shiftType);
                            const futureHours = currentHours + shiftHours;
                            
                            // 168時間を超える場合は割り当てをスキップ
                            if (futureHours > targetHoursMax) {
                                return; // スキップ
                            }
                        }
                        
                        placeShiftInCell(cell, shiftType);
                        
                        if (shiftCounts[staff][shiftType] !== undefined) {
                            shiftCounts[staff][shiftType]++;
                        }
                        
                        assigned++;
                    }
                }
            }
        });
    }
}

// 日付セルを取得
function getDateCell(staffName, date) {
    const staffRow = document.querySelector(`.staff-row[data-staff="${staffName}"]`);
    if (staffRow) {
        return staffRow.querySelector(`.date-cell[data-date="${date}"]`);
    }
    return null;
}

// すべてのスケジュールをクリア
function clearAllSchedules() {
    const dates = window.appData.dates;
    const staffList = window.appData.staffList;
    
    if (!dates || !staffList) {
        console.error('appDataが正しく設定されていません');
        return;
    }
    
    staffList.forEach(staffName => {
        dates.forEach(dateInfo => {
            const cell = getDateCell(staffName, dateInfo.date);
            if (cell) {
                const shiftContent = cell.querySelector('.shift-content');
                if (shiftContent) {
                    // シフトコンテンツを削除
                    shiftContent.remove();
                    
                    // 日付ラベルを再表示
                    cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
                        el.style.display = 'block';
                    });
                    
                    // データから削除
                    if (scheduleData[staffName] && scheduleData[staffName][dateInfo.date]) {
                        delete scheduleData[staffName][dateInfo.date];
                    }
                }
            }
        });
    });
    
    scheduleData = {};
    
    // すべてのスタッフの勤務時間を更新
    if (staffList) {
        staffList.forEach(staffName => {
            updateStaffHours(staffName);
        });
    }
}

// 「休」「有休」以外のスケジュールをクリア
function clearAllSchedulesExceptRest(savedRestDays) {
    const dates = window.appData.dates;
    const staffList = window.appData.staffList;
    
    if (!dates || !staffList) {
        console.error('appDataが正しく設定されていません');
        return;
    }
    
    staffList.forEach(staffName => {
        dates.forEach(dateInfo => {
            const cell = getDateCell(staffName, dateInfo.date);
            if (cell) {
                const shiftContent = cell.querySelector('.shift-content');
                if (shiftContent) {
                    const shiftType = shiftContent.dataset.shift;
                    // 「休」「有休」は保持（savedRestDaysに保存されているもののみ）
                    if ((shiftType === '休' || shiftType === '有休') && 
                        savedRestDays[staffName] && savedRestDays[staffName][dateInfo.date]) {
                        return; // スキップ
                    }
                    
                    // シフトコンテンツを削除
                    shiftContent.remove();
                    
                    // 日付ラベルを再表示
                    cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
                        el.style.display = 'block';
                    });
                    
                    // データから削除
                    if (scheduleData[staffName] && scheduleData[staffName][dateInfo.date]) {
                        delete scheduleData[staffName][dateInfo.date];
                    }
                }
            }
        });
    });
    
    // 「休」「有休」以外のデータをクリア
    Object.keys(scheduleData).forEach(staffName => {
        Object.keys(scheduleData[staffName]).forEach(date => {
            const shiftType = scheduleData[staffName][date];
            if (shiftType !== '休' && shiftType !== '有休') {
                delete scheduleData[staffName][date];
            }
        });
    });
    
    // すべてのスタッフの勤務時間を更新
    if (staffList) {
        staffList.forEach(staffName => {
            updateStaffHours(staffName);
        });
    }
}
