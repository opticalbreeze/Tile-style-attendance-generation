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
    
    initializeSchedule();
    setupDragAndDrop();
    initializeSummary();
    setupAutoAttend();
    initializeAllStaffHours();
};

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
    switch(shiftType) {
        case '日勤':
            return 8;
        case '24A':
        case '24B':
        case '夜勤':
            return 16;
        case '有休':
            return 8;
        default:
            return 0;
    }
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
    
    // 24A、24B、または夜勤が配置された場合、翌日に自動的に「明」を配置
    if (shiftType === '24A' || shiftType === '24B' || shiftType === '夜勤') {
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

// 自動アテンド機能のセットアップ
function setupAutoAttend() {
    const autoAttendBtn = document.getElementById('auto-attend-btn');
    if (autoAttendBtn) {
        autoAttendBtn.addEventListener('click', function() {
            if (confirm('既存のスケジュールをすべてクリアして自動アテンドを実行しますか？')) {
                autoAttend();
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
    
    // 日勤専門スタッフを取得（上位3名）
    const dayShiftOnlyStaff = [];
    for (let i = 0; i < Math.min(3, staffList.length); i++) {
        const checkbox = document.getElementById(`day-shift-only-${i + 1}`);
        if (checkbox && checkbox.checked) {
            dayShiftOnlyStaff.push(staffList[i]);
        }
    }
    
    // 24時間交代勤務スタッフ（日勤専門以外）
    const shiftStaff = staffList.filter(staff => !dayShiftOnlyStaff.includes(staff));
    
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
    const shiftCounts = {};
    staffList.forEach(staff => {
        shiftCounts[staff] = {
            '24A': 0,
            '24B': 0,
            '夜勤': 0,
            '日勤': 0
        };
    });
    
    // 日付ごとに処理
    dates.forEach((dateInfo, dateIndex) => {
        const date = new Date(dateInfo.date);
        const weekday = dateInfo.weekday_jp;
        const isWeekend = weekday === '土' || weekday === '日';
        
        if (isWeekend) {
            // 土日：24勤3名
            assignShiftWorkers(dateInfo.date, shiftStaff, ['24A', '24B'], 3, shiftCounts, dateIndex);
            
            // 日勤専門スタッフは休み（希望休が既に配置されている場合はスキップ）
            dayShiftOnlyStaff.forEach(staff => {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    const existingShift = cell.querySelector('.shift-content');
                    if (!existingShift) {
                        placeShiftInCell(cell, '休');
                    }
                }
            });
        } else {
            // 平日：日勤3名、24勤3名
            // 日勤専門スタッフから日勤を配置
            const dayShiftAssignments = assignDayShiftWorkers(dateInfo.date, dayShiftOnlyStaff, 3);
            
            // 残りの日勤を交代勤務スタッフから配置
            const remainingDayShift = 3 - dayShiftAssignments;
            if (remainingDayShift > 0) {
                assignShiftWorkers(dateInfo.date, shiftStaff, ['日勤'], remainingDayShift, shiftCounts, dateIndex);
            }
            
            // 24勤3名を配置
            assignShiftWorkers(dateInfo.date, shiftStaff, ['24A', '24B'], 3, shiftCounts, dateIndex);
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
function assignShiftWorkers(date, staffList, shiftTypes, requiredCount, shiftCounts, dateIndex) {
    const dates = window.appData.dates;
    
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
    let totalHoursAll = 0;
    let staffCount = 0;
    staffList.forEach(staff => {
        const hours = calculateStaffHours(staff);
        totalHoursAll += hours;
        staffCount++;
    });
    const averageHours = staffCount > 0 ? totalHoursAll / staffCount : 0;
    
    // 各スタッフの優先度を計算
    const priorities = staffList.map(staff => {
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
        const is24ShiftType = shiftTypes.some(type => ['24A', '24B', '夜勤'].includes(type));
        
        if (is24ShiftType) {
            // 前日が24A/24B/夜勤の場合、今日は「明」が入るので、今日に24勤を配置してはいけない
            const isPrev24Shift = ['24A', '24B', '夜勤'].includes(prevShift);
            if (isPrev24Shift) {
                return {
                    staff: staff,
                    priority: 5000,
                    totalShifts: 5000,
                    prevShift: prevShift,
                    canAssign: false
                };
            }
            
            // 前々日が24A/24B/夜勤の場合、前日は「明」が入るので、今日は24勤禁止
            const isAfterMorning = ['24A', '24B', '夜勤'].includes(prevPrevShift);
            if (isAfterMorning) {
                return {
                    staff: staff,
                    priority: 5000,
                    totalShifts: 5000,
                    prevShift: prevShift,
                    canAssign: false
                };
            }
        }
        
        const isContinuous = ['24A', '24B', '夜勤'].includes(prevShift);
        const totalShifts = shiftCounts[staff]['24A'] + shiftCounts[staff]['24B'] + shiftCounts[staff]['夜勤'] + shiftCounts[staff]['日勤'];
        
        // 労働時間を計算（希望休も含む）
        const currentHours = calculateStaffHours(staff);
        
        // 平均からの差を大きくペナルティとして反映（労働時間が少ないほど優先）
        // 差を100倍して、連続勤務のペナルティ（1000）より大きくする
        const hoursDifference = currentHours - averageHours;
        const hoursPenalty = hoursDifference * 100;
        
        // 連続勤務のペナルティ（1000）と労働時間のペナルティを組み合わせ
        const basePriority = isContinuous ? 1000 : 0;
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
                    const isPrev24Shift = ['24A', '24B', '夜勤'].includes(prevShift);
                    
                    if (!isPrev24Shift || shiftTypes.includes('日勤')) {
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
    
    // 必要な人数に達しない場合は、連続勤務でも割り当て（ただし「休」「有休」は避ける）
    if (assigned < requiredCount) {
        priorities.forEach(({staff, canAssign}) => {
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
