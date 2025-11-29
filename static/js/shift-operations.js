// シフト操作モジュール
// シフトの配置、削除、時間計算

window.ShiftOperations = (function() {
    
    // Utilsモジュールへの参照（遅延評価）
    function utils() {
        return window.Utils || {};
    }
    
    // シフトタイプから勤務時間を取得
    function getShiftHours(shiftType) {
        if (!shiftType) return 0;
        // Utilsが利用可能な場合はそちらを使用
        if (utils().getShiftHours) {
            return utils().getShiftHours(shiftType);
        }
        const config = window.appData?.config;
        if (config && config.shiftHours && config.shiftHours[shiftType] !== undefined) {
            return config.shiftHours[shiftType];
        }
        return 0;
    }

    // スタッフの勤務時間を計算
    function calculateStaffHours(staffName) {
        if (!staffName) return 0;
        const dates = window.appData?.dates;
        if (!dates || !Array.isArray(dates)) return 0;
        
        const scheduleData = window.ScheduleState?.getScheduleData() || {};
        let totalHours = 0;
        dates.forEach(dateInfo => {
            if (!dateInfo?.date) return;
            const shiftType = scheduleData[staffName]?.[dateInfo.date];
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
        if (!cell) {
            console.warn('removeShiftFromCell: cell is null');
            return;
        }
        
        const shiftContent = cell.querySelector('.shift-content');
        if (shiftContent) {
            const staffName = cell.dataset?.staff;
            const date = cell.dataset?.date;
            const shiftType = shiftContent.dataset?.shift;
            
            if (!staffName || !date) {
                console.warn('removeShiftFromCell: missing staffName or date');
                return;
            }
            
            shiftContent.remove();
            
            // 日付ラベルを再表示
            cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
                el.style.display = 'block';
            });
            
            // データから削除
            window.ScheduleState.removeStaffShift(staffName, date);
            
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
            if (window.Summary && window.Summary.updateSummary) {
                window.Summary.updateSummary();
            }
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
                        // 「休」「有休」が既に配置されている場合はスキップ
                        if (existingShiftType === restShift || existingShiftType === paidLeaveShift) {
                            return;
                        }
                        // 既に「明」が配置されている場合はスキップ
                        if (existingShiftType === morningShift) {
                            return;
                        }
                    }
                    
                    // 「明」を配置
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
        if (!cell) {
            console.warn('placeShiftInCell: cell is null');
            return;
        }
        if (!shiftType) {
            console.warn('placeShiftInCell: shiftType is null');
            return;
        }
        
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
        shiftContent.addEventListener('dragstart', function(e) {
            if (window.DragDrop && window.DragDrop.handleShiftDragStart) {
                window.DragDrop.handleShiftDragStart(e);
            }
        });
        shiftContent.addEventListener('dragend', function(e) {
            if (window.DragDrop && window.DragDrop.handleShiftDragEnd) {
                window.DragDrop.handleShiftDragEnd(e);
            }
        });
        
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
        window.ScheduleState.setStaffShift(staffName, date, shiftType);
        
        // 24A、24B、または夜勤が配置された場合、翌日に自動的に「明」を配置
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        if (hour24Shifts.includes(shiftType)) {
            autoPlaceMorningShift(staffName, date);
        }
        
        // 勤務時間を更新
        updateStaffHours(staffName);
        
        // 集計を更新
        if (window.Summary && window.Summary.updateSummary) {
            window.Summary.updateSummary();
        }
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
                const cell = window.ScheduleGrid.getDateCell(staffName, dateInfo.date);
                if (cell) {
                    const shiftContent = cell.querySelector('.shift-content');
                    if (shiftContent) {
                        shiftContent.remove();
                        
                        cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
                            el.style.display = 'block';
                        });
                    }
                }
            });
        });
        
        window.ScheduleState.clearAllSchedules();
        
        // すべてのスタッフの勤務時間を更新
        if (staffList) {
            staffList.forEach(staffName => {
                updateStaffHours(staffName);
            });
        }
    }

    // 「休」「有休」「明」以外のスケジュールをクリア
    function clearAllSchedulesExceptRest(savedRestDays) {
        const dates = window.appData.dates;
        const staffList = window.appData.staffList;
        const config = window.appData?.config || {};
        const shiftTypesConfig = config.shiftTypes || {};
        const morningShift = shiftTypesConfig.morningShift || '明';
        
        if (!dates || !staffList) {
            console.error('appDataが正しく設定されていません');
            return;
        }
        
        const scheduleData = window.ScheduleState.getScheduleData();
        
        staffList.forEach(staffName => {
            dates.forEach(dateInfo => {
                const cell = window.ScheduleGrid.getDateCell(staffName, dateInfo.date);
                if (cell) {
                    const shiftContent = cell.querySelector('.shift-content');
                    if (shiftContent) {
                        const shiftType = shiftContent.dataset.shift;
                        // 「休」「有休」「明」は保持
                        if ((shiftType === '休' || shiftType === '有休' || shiftType === morningShift) && 
                            savedRestDays[staffName] && savedRestDays[staffName][dateInfo.date]) {
                            return;
                        }
                        
                        shiftContent.remove();
                        
                        cell.querySelectorAll('.date-label, .date-weekday').forEach(el => {
                            el.style.display = 'block';
                        });
                        
                        window.ScheduleState.removeStaffShift(staffName, dateInfo.date);
                    }
                }
            });
        });
        
        // 「休」「有休」「明」以外のデータをクリア
        Object.keys(scheduleData).forEach(staffName => {
            Object.keys(scheduleData[staffName] || {}).forEach(date => {
                const shiftType = scheduleData[staffName][date];
                if (shiftType !== '休' && shiftType !== '有休' && shiftType !== morningShift) {
                    window.ScheduleState.removeStaffShift(staffName, date);
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

    // 公開API
    return {
        getShiftHours: getShiftHours,
        calculateStaffHours: calculateStaffHours,
        updateStaffHours: updateStaffHours,
        initializeAllStaffHours: initializeAllStaffHours,
        removeShiftFromCell: removeShiftFromCell,
        showDeleteMenu: showDeleteMenu,
        autoPlaceMorningShift: autoPlaceMorningShift,
        removeMorningShiftFromNextDay: removeMorningShiftFromNextDay,
        placeShiftInCell: placeShiftInCell,
        clearAllSchedules: clearAllSchedules,
        clearAllSchedulesExceptRest: clearAllSchedulesExceptRest
    };
})();

// グローバル関数として公開（後方互換性）
window.getShiftHours = window.ShiftOperations.getShiftHours;
window.calculateStaffHours = window.ShiftOperations.calculateStaffHours;
window.updateStaffHours = window.ShiftOperations.updateStaffHours;
window.placeShiftInCell = window.ShiftOperations.placeShiftInCell;
window.clearAllSchedules = window.ShiftOperations.clearAllSchedules;
window.clearAllSchedulesExceptRest = window.ShiftOperations.clearAllSchedulesExceptRest;

