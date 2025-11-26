// 最適化されたシフト割り当てアルゴリズム
// 2段階アプローチ：月全体の配分を決定 → 日付ごとに配置

// 月全体の最適化されたシフト割り当て
function optimizedAutoAttend() {
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
    
    // 日勤専門スタッフを取得
    const config = window.appData?.config || {};
    const dayShiftOnlyCount = config.staff?.dayShiftOnlyCount || 3;
    const dayShiftOnlyStaff = [];
    for (let i = 0; i < Math.min(dayShiftOnlyCount, staffList.length); i++) {
        const checkbox = document.getElementById(`day-shift-only-${i + 1}`);
        if (checkbox && checkbox.checked && !excludedStaff.includes(staffList[i])) {
            dayShiftOnlyStaff.push(staffList[i]);
        }
    }
    
    // 24時間交代勤務スタッフ
    const shiftStaff = staffList.filter(staff => 
        !dayShiftOnlyStaff.includes(staff) && !excludedStaff.includes(staff)
    );
    
    // 前月15日のシフトを確認し、16日に「明」を配置
    const periodData = window.appData.periodData || {};
    const startDate = periodData.start_date;
    if (startDate && dates.length > 0) {
        const startDateObj = new Date(startDate + 'T00:00:00');
        startDateObj.setDate(startDateObj.getDate() - 1);
        const prevMonth15th = startDateObj.toISOString().split('T')[0];
        const firstDate = dates[0].date;
        
        const shiftTypesConfig = config.shiftTypes || {};
        const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
        const morningShift = shiftTypesConfig.morningShift || '明';
        
        staffList.forEach(staffName => {
            let prevMonth15thShift = scheduleData[staffName] && scheduleData[staffName][prevMonth15th];
            if (!prevMonth15thShift) {
                try {
                    const savedData = localStorage.getItem('scheduleData');
                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        prevMonth15thShift = parsedData[staffName] && parsedData[staffName][prevMonth15th];
                    }
                } catch (e) {}
            }
            
            if (prevMonth15thShift && hour24Shifts.includes(prevMonth15thShift)) {
                const firstDateCell = getDateCell(staffName, firstDate);
                if (firstDateCell) {
                    const existingShift = firstDateCell.querySelector('.shift-content');
                    if (!existingShift) {
                        placeShiftInCell(firstDateCell, morningShift);
                    }
                }
            }
        });
    }
    
    // 既存の「休」「有休」を保存
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
    
    // 第1段階：月全体で各スタッフの24勤回数を決定
    const targetHoursMax = 168;
    const shift24Hours = 16;
    const requiredStaff = config.requiredStaff || {};
    const weekdayReq = requiredStaff.weekday || { dayShift: 3, nightShift: 3 };
    const weekendReq = requiredStaff.weekend || { nightShift: 3 };
    
    // 各日付で必要な24勤人数を計算
    const daily24ShiftNeeds = dates.map(dateInfo => {
        const isWeekend = dateInfo.weekday_jp === '土' || dateInfo.weekday_jp === '日';
        return isWeekend ? (weekendReq.nightShift || 3) : (weekdayReq.nightShift || 3);
    });
    
    const total24ShiftNeeded = daily24ShiftNeeds.reduce((sum, count) => sum + count, 0);
    
    // 各スタッフの目標24勤回数を計算（均等配分、168時間以内）
    const target24ShiftCount = {};
    const availableStaffCount = shiftStaff.length;
    if (availableStaffCount > 0) {
        const base24Shifts = Math.floor(total24ShiftNeeded / availableStaffCount);
        const remainder = total24ShiftNeeded % availableStaffCount;
        const max24Shifts = Math.floor(targetHoursMax / shift24Hours); // 10回
        
        shiftStaff.forEach((staff, index) => {
            let targetCount = base24Shifts;
            if (index < remainder) {
                targetCount++;
            }
            targetCount = Math.min(targetCount, max24Shifts);
            target24ShiftCount[staff] = targetCount;
        });
    }
    
    // 第2段階：日付ごとに最適化された割り当て
    const shiftCounts = {};
    staffList.forEach(staff => {
        shiftCounts[staff] = { '24A': 0, '24B': 0, '日勤': 0 };
    });
    
    // 各日付で最適化された割り当てを実行
    dates.forEach((dateInfo, dateIndex) => {
        const isWeekend = dateInfo.weekday_jp === '土' || dateInfo.weekday_jp === '日';
        const requiredNightShift = isWeekend ? (weekendReq.nightShift || 3) : (weekdayReq.nightShift || 3);
        const requiredDayShift = isWeekend ? 0 : (weekdayReq.dayShift || 3);
        
        // 日勤専門スタッフから日勤を配置
        if (!isWeekend && requiredDayShift > 0) {
            const dayShiftAssignments = assignDayShiftWorkers(dateInfo.date, dayShiftOnlyStaff, requiredDayShift);
            const remainingDayShift = requiredDayShift - dayShiftAssignments;
            if (remainingDayShift > 0) {
                optimizedAssignShifts(dateInfo.date, shiftStaff, ['日勤'], remainingDayShift, shiftCounts, dateIndex, target24ShiftCount, dates);
            }
        }
        
        // 24勤を最適化された方法で配置
        optimizedAssignShifts(dateInfo.date, shiftStaff, ['24A', '24B'], requiredNightShift, shiftCounts, dateIndex, target24ShiftCount, dates);
        
        // 日勤専門スタッフは休み
        if (isWeekend) {
            dayShiftOnlyStaff.forEach(staff => {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    const existingShift = cell.querySelector('.shift-content');
                    if (!existingShift) {
                        placeShiftInCell(cell, '休');
                    }
                }
            });
        }
    });
    
    // 集計を更新
    updateSummary();
    alert('最適化された自動アテンドが完了しました。');
}

// 最適化されたシフト割り当て（残りの日数と必要な回数を考慮）
function optimizedAssignShifts(date, staffList, shiftTypes, requiredCount, shiftCounts, dateIndex, target24ShiftCount, dates) {
    const targetHoursMax = 168;
    const shift24Hours = 16;
    const is24ShiftType = shiftTypes.includes('24A') || shiftTypes.includes('24B');
    
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
    
    // 各スタッフの優先度を計算（残りの日数と必要な回数を考慮）
    const remainingDays = dates.length - dateIndex;
    const config = window.appData?.config || {};
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    
    const candidates = staffList.map(staff => {
        const prevShift = prevShifts[staff] || '';
        const prevPrevShift = prevPrevShifts[staff] || '';
        const cell = getDateCell(staff, date);
        
        // 既にシフトが配置されている場合は除外
        if (cell) {
            const existingShift = cell.querySelector('.shift-content');
            if (existingShift) {
                const existingShiftType = existingShift.dataset.shift;
                if (existingShiftType === '休' || existingShiftType === '有休') {
                    return { staff, priority: Infinity, canAssign: false };
                }
                if (existingShiftType !== '明') {
                    return { staff, priority: Infinity, canAssign: false };
                }
            }
        }
        
        // 24勤の場合の制約チェック
        if (is24ShiftType) {
            // 前日が24勤の場合は不可
            if (hour24Shifts.includes(prevShift)) {
                return { staff, priority: Infinity, canAssign: false };
            }
            // 前々日が24勤 AND 前日が「明」の場合は不可
            if (hour24Shifts.includes(prevPrevShift) && prevShift === morningShift) {
                return { staff, priority: Infinity, canAssign: false };
            }
            
            // 労働時間制約をチェック
            const currentHours = calculateStaffHours(staff);
            const futureHours = currentHours + shift24Hours;
            if (futureHours > targetHoursMax) {
                return { staff, priority: Infinity, canAssign: false };
            }
            
            // 目標回数と現在の回数を比較
            const current24Count = (shiftCounts[staff]['24A'] || 0) + (shiftCounts[staff]['24B'] || 0);
            const targetCount = target24ShiftCount[staff] || 0;
            const remaining24Shifts = targetCount - current24Count;
            
            // 残りの日数で達成可能かチェック
            const canAchieveTarget = remaining24Shifts <= remainingDays;
            
            // 優先度計算：目標回数に達していない場合、残りの日数で達成可能な場合を優先
            if (remaining24Shifts > 0 && canAchieveTarget) {
                // 目標回数に達していない場合、少ないほど優先
                return {
                    staff,
                    priority: -100000 - (remaining24Shifts * 10000) + (targetHoursMax - currentHours) * 10,
                    canAssign: true,
                    currentHours,
                    current24Count,
                    remaining24Shifts
                };
            } else if (remaining24Shifts <= 0) {
                // 目標回数に達している場合、優先度を下げる（ただし168時間以内なら可能）
                return {
                    staff,
                    priority: 50000 + (current24Count - targetCount) * 1000,
                    canAssign: true,
                    currentHours,
                    current24Count,
                    remaining24Shifts
                };
            } else {
                // 残りの日数で達成不可能な場合、優先度を下げる
                return {
                    staff,
                    priority: 40000 + (remaining24Shifts - remainingDays) * 1000,
                    canAssign: true,
                    currentHours,
                    current24Count,
                    remaining24Shifts
                };
            }
        } else {
            // 日勤の場合
            const currentHours = calculateStaffHours(staff);
            return {
                staff,
                priority: -50000 + (targetHoursMax - currentHours) * 10,
                canAssign: true,
                currentHours
            };
        }
    }).filter(c => c.canAssign);
    
    // 優先度順にソート
    candidates.sort((a, b) => a.priority - b.priority);
    
    // 必要な人数を割り当て
    let assigned = 0;
    let shiftTypeCounter = 0;
    
    candidates.forEach(({staff}) => {
        if (assigned < requiredCount) {
            const cell = getDateCell(staff, date);
            if (cell && !cell.querySelector('.shift-content')) {
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
    });
    
    // 必要な人数に達しない場合、制約を緩和して割り当て
    if (assigned < requiredCount) {
        staffList.forEach(staff => {
            if (assigned < requiredCount) {
                const cell = getDateCell(staff, date);
                if (cell) {
                    const existingShift = cell.querySelector('.shift-content');
                    if (!existingShift) {
                        const prevShift = prevShifts[staff] || '';
                        const prevPrevShift = prevPrevShifts[staff] || '';
                        
                        // 24勤の場合の制約チェック
                        if (is24ShiftType) {
                            if (hour24Shifts.includes(prevShift)) return;
                            if (hour24Shifts.includes(prevPrevShift) && prevShift === morningShift) return;
                            
                            const currentHours = calculateStaffHours(staff);
                            if (currentHours + shift24Hours > targetHoursMax) return;
                        }
                        
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

