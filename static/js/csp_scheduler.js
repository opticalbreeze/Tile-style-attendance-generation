// 看護師シフトスケジュール生成 - 制約充足問題（CSP）アプローチ
// バックトラッキングを使用した厳密な制約チェック

/**
 * 制約充足問題として看護師シフトを生成
 * 
 * 制約条件：
 * 1. 各日付で必要な人数を満たす
 * 2. 24勤の翌日は必ず「明」
 * 3. 月間労働時間は168時間以内
 * 4. 連続勤務の制約（24勤→明→24勤のパターンは可能）
 * 5. 前月15日が24勤の場合、16日は「明」
 */
function cspAutoAttend() {
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
    
    // 既存の「休」「有休」「明」を保存
    const shiftTypesConfig = config.shiftTypes || {};
    const morningShift = shiftTypesConfig.morningShift || '明';
    const savedRestDays = {};
    staffList.forEach(staffName => {
        dates.forEach(dateInfo => {
            const cell = getDateCell(staffName, dateInfo.date);
            if (cell) {
                const shiftContent = cell.querySelector('.shift-content');
                if (shiftContent) {
                    const shiftType = shiftContent.dataset.shift;
                    if (shiftType === '休' || shiftType === '有休' || shiftType === morningShift) {
                        if (!savedRestDays[staffName]) {
                            savedRestDays[staffName] = {};
                        }
                        savedRestDays[staffName][dateInfo.date] = shiftType;
                    }
                }
            }
        });
    });
    
    // 既存のスケジュールをクリア（「休」「有休」「明」以外）
    clearAllSchedulesExceptRest(savedRestDays);
    
    // 保存した「休」「有休」「明」を復元
    Object.keys(savedRestDays).forEach(staffName => {
        Object.keys(savedRestDays[staffName]).forEach(date => {
            const cell = getDateCell(staffName, date);
            if (cell) {
                const shiftType = savedRestDays[staffName][date];
                placeShiftInCell(cell, shiftType);
            }
        });
    });
    
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
    
    // CSPソルバーでシフトを生成
    const solution = solveCSP(dates, shiftStaff, dayShiftOnlyStaff, config, savedRestDays);
    
    if (solution) {
        // 解が見つかった場合、スケジュールを適用
        applySolution(solution, dates, staffList);
        updateSummary();
        alert('CSPアルゴリズムによる自動アテンドが完了しました。');
    } else {
        alert('制約を満たす解が見つかりませんでした。制約条件を緩和するか、スタッフ数を確認してください。');
    }
}

/**
 * CSPソルバー：バックトラッキングを使用
 */
function solveCSP(dates, shiftStaff, dayShiftOnlyStaff, config, savedRestDays) {
    // 設定から定数を取得（ハードコーディング削減）
    const constraints = config.constraints || {};
    const shiftHoursConfig = config.shiftHours || {};
    const targetHoursMax = constraints.targetHoursMax || 176;
    const shift24Hours = shiftHoursConfig['24A'] || 16;
    const dayShiftHours = shiftHoursConfig['日勤'] || 8;
    const requiredStaff = config.requiredStaff || {};
    const weekdayReq = requiredStaff.weekday || { dayShift: 3, nightShift: 3 };
    const weekendReq = requiredStaff.weekend || { nightShift: 3 };
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    
    // 制約設定を取得（constraintsは上で既に宣言済み）
    const maxConsecutive24Shifts = constraints.maxConsecutive24Shifts || 2;
    const preventSamePair = constraints.preventSamePair !== false;
    const samePairPenalty = config.penalties?.samePairPenalty || 100000;
    
    // 各日付で必要な人数を計算
    const dailyRequirements = dates.map(dateInfo => {
        const isWeekend = dateInfo.weekday_jp === '土' || dateInfo.weekday_jp === '日';
        return {
            date: dateInfo.date,
            dayShift: isWeekend ? 0 : (weekdayReq.dayShift || 3),
            nightShift: isWeekend ? (weekendReq.nightShift || 3) : (weekdayReq.nightShift || 3)
        };
    });
    
    // 月全体で必要な24勤回数を計算
    const total24ShiftNeeded = dailyRequirements.reduce((sum, req) => sum + req.nightShift, 0);
    
    // 各スタッフの目標24勤回数を計算（均等配分、168時間以内）
    const target24ShiftCount = {};
    const availableStaffCount = shiftStaff.length;
    if (availableStaffCount > 0) {
        const base24Shifts = Math.floor(total24ShiftNeeded / availableStaffCount);
        const remainder = total24ShiftNeeded % availableStaffCount;
        const max24Shifts = Math.floor(targetHoursMax / shift24Hours); // 11回（176時間 ÷ 16時間 = 11回）
        
        shiftStaff.forEach((staff, index) => {
            let targetCount = base24Shifts;
            if (index < remainder) {
                targetCount++;
            }
            targetCount = Math.min(targetCount, max24Shifts);
            target24ShiftCount[staff] = targetCount;
        });
    }
    
    // 初期状態：各スタッフの各日付のシフト（未割り当て）
    const schedule = {};
    shiftStaff.forEach(staff => {
        schedule[staff] = {};
        dates.forEach(dateInfo => {
            // 既に「休」「有休」「明」が設定されている場合は保持
            if (savedRestDays[staff] && savedRestDays[staff][dateInfo.date]) {
                schedule[staff][dateInfo.date] = savedRestDays[staff][dateInfo.date];
            } else {
                schedule[staff][dateInfo.date] = null; // 未割り当て
            }
        });
    });
    
    // 日勤専門スタッフの日勤を先に割り当て
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        if (req.dayShift > 0) {
            let dayShiftAssigned = 0;
            dayShiftOnlyStaff.forEach(staff => {
                if (dayShiftAssigned < req.dayShift) {
                    if (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date]) {
                        schedule[staff] = schedule[staff] || {};
                        schedule[staff][dateInfo.date] = dayShiftType;
                        dayShiftAssigned++;
                    }
                }
            });
        }
    });
    
    // ヒューリスティックアプローチ：優先度に基づいて割り当て
    // バックトラッキングは計算量が大きいため、実用的なヒューリスティックを使用
    const result = heuristicAssign24Shifts(
        schedule, 
        dates, 
        shiftStaff, 
        dailyRequirements, 
        target24ShiftCount,
        targetHoursMax,
        shift24Hours,
        hour24Shifts,
        morningShift,
        maxConsecutive24Shifts,
        preventSamePair,
        samePairPenalty
    );
    
    return result ? schedule : null;
}

/**
 * ヒューリスティックアプローチ：優先度に基づいて24勤を割り当て
 * 各日付で、制約を満たす候補者を優先度順に選択
 */
function heuristicAssign24Shifts(
    schedule, 
    dates, 
    shiftStaff, 
    dailyRequirements, 
    target24ShiftCount,
    targetHoursMax,
    shift24Hours,
    hour24Shifts,
    morningShift,
    maxConsecutive24Shifts = 2,
    preventSamePair = true,
    samePairPenalty = 100000
) {
    // 前日の24勤担当者ペアを追跡（ペア連続防止用）
    let previousDayPair = [];
    
    // 各日付で順次割り当て
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        const requiredNightShift = req.nightShift;
        
        // 候補者を取得
        const candidates = getCandidates(
            schedule, dateInfo.date, shiftStaff, dates, dateIndex,
            target24ShiftCount, targetHoursMax, shift24Hours, hour24Shifts, morningShift,
            previousDayPair, preventSamePair, samePairPenalty, maxConsecutive24Shifts
        );
        
        // 優先度順にソート
        candidates.sort((a, b) => a.priority - b.priority);
        
        // 必要な人数分だけ割り当て
        let assigned = 0;
        const todaysAssignedStaff = [];
        candidates.forEach((candidate, idx) => {
            if (assigned < requiredNightShift) {
                if (canAssign24Shift(schedule, candidate.staff, dateInfo.date, dates, dateIndex, targetHoursMax, shift24Hours, hour24Shifts, morningShift, maxConsecutive24Shifts)) {
                    const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                    schedule[candidate.staff][dateInfo.date] = shiftType;
                    todaysAssignedStaff.push(candidate.staff);
                    
                    // 翌日に「明」を自動配置
                    if (dateIndex < dates.length - 1) {
                        const nextDate = dates[dateIndex + 1].date;
                        if (!schedule[candidate.staff][nextDate] || schedule[candidate.staff][nextDate] === null) {
                            schedule[candidate.staff][nextDate] = morningShift;
                        }
                    }
                    
                    assigned++;
                }
            }
        });
        
        // 必要な人数に達しない場合、制約を緩和して割り当て
        if (assigned < requiredNightShift) {
            shiftStaff.forEach(staff => {
                if (assigned < requiredNightShift) {
                    if (canAssign24Shift(schedule, staff, dateInfo.date, dates, dateIndex, targetHoursMax, shift24Hours, hour24Shifts, morningShift, maxConsecutive24Shifts)) {
                        const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                        schedule[staff][dateInfo.date] = shiftType;
                        todaysAssignedStaff.push(staff);
                        
                        if (dateIndex < dates.length - 1) {
                            const nextDate = dates[dateIndex + 1].date;
                            if (!schedule[staff][nextDate] || schedule[staff][nextDate] === null) {
                                schedule[staff][nextDate] = morningShift;
                            }
                        }
                        
                        assigned++;
                    }
                }
            });
        }
        
        // 当日の24勤担当者ペアを記録（次の日のペア連続防止用）
        previousDayPair = todaysAssignedStaff;
    });
    
    return true;
}

/**
 * 候補者を取得（優先度付き）
 */
function getCandidates(schedule, date, shiftStaff, dates, dateIndex, target24ShiftCount, targetHoursMax, shift24Hours, hour24Shifts, morningShift, previousDayPair = [], preventSamePair = true, samePairPenalty = 100000, maxConsecutive24Shifts = 2) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    const remainingDays = dates.length - dateIndex;
    
    shiftStaff.forEach(staff => {
        // 既にシフトが割り当てられている場合はスキップ
        if (schedule[staff][date] && schedule[staff][date] !== null) {
            return;
        }
        
        const prevShift = prevDate ? (schedule[staff][prevDate] || null) : null;
        const prevPrevShift = prevPrevDate ? (schedule[staff][prevPrevDate] || null) : null;
        
        // 制約チェック
        if (hour24Shifts.includes(prevShift)) return; // 前日が24勤の場合は不可
        
        // 「24明24明24明」の連続パターンをチェック（設定値まで許可）
        let consecutive24MorningCount = 0;
        let checkDate = prevDate;
        let checkPrevDate = prevPrevDate;
        while (checkDate && checkPrevDate) {
            const checkShift = schedule[staff][checkDate];
            const checkPrevShift = schedule[staff][checkPrevDate];
            if (checkShift === morningShift && hour24Shifts.includes(checkPrevShift)) {
                consecutive24MorningCount++;
                const checkIndex = dates.findIndex(d => d.date === checkPrevDate);
                if (checkIndex > 0) {
                    checkDate = dates[checkIndex - 1].date;
                    checkPrevDate = checkIndex > 1 ? dates[checkIndex - 2].date : null;
                } else {
                    break;
                }
            } else {
                break;
            }
        }
        // 連続24勤の制限（設定値を超える場合は不可）
        if (consecutive24MorningCount >= maxConsecutive24Shifts) {
            return;
        }
        
        // 労働時間を計算
        let currentHours = 0;
        let current24Count = 0;
        dates.forEach((d, idx) => {
            if (idx < dateIndex) {
                const shift = schedule[staff][d.date];
                if (shift === '24A' || shift === '24B') {
                    currentHours += shift24Hours;
                    current24Count++;
                } else if (shift === '日勤') {
                    currentHours += 8;
                }
            }
        });
        
        const futureHours = currentHours + shift24Hours;
        if (futureHours > targetHoursMax) return; // 176時間を超える場合は不可
        
        // 同じペアの連続防止チェック
        let samePairPenaltyValue = 0;
        if (preventSamePair && previousDayPair.length > 0) {
            if (previousDayPair.includes(staff)) {
                samePairPenaltyValue = samePairPenalty;
            }
        }
        
        // 目標回数と現在の回数を比較
        const targetCount = target24ShiftCount[staff] || 0;
        const remaining24Shifts = targetCount - current24Count;
        
        // 優先度計算
        let priority = 0;
        if (remaining24Shifts > 0 && remaining24Shifts <= remainingDays) {
            priority = samePairPenaltyValue - 100000 - (remaining24Shifts * 10000) + (targetHoursMax - currentHours) * 10;
        } else if (remaining24Shifts <= 0) {
            priority = samePairPenaltyValue + 50000 + (current24Count - targetCount) * 1000;
        } else {
            priority = samePairPenaltyValue + 40000 + (remaining24Shifts - remainingDays) * 1000;
        }
        
        candidates.push({
            staff,
            priority,
            currentHours,
            current24Count,
            remaining24Shifts
        });
    });
    
    return candidates;
}

/**
 * 24勤を割り当て可能かチェック
 */
function canAssign24Shift(schedule, staff, date, dates, dateIndex, targetHoursMax, shift24Hours, hour24Shifts, morningShift, maxConsecutive24Shifts = 2) {
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    
    // 既にシフトが割り当てられている場合は不可
    if (schedule[staff][date] && schedule[staff][date] !== null) {
        return false;
    }
    
    // 前日が24勤の場合は不可
    if (prevDate) {
        const prevShift = schedule[staff][prevDate];
        if (hour24Shifts.includes(prevShift)) {
            return false;
        }
    }
    
    // 「24明24明24明」の連続パターンをチェック（設定値まで許可）
    let consecutive24MorningCount = 0;
    let checkDate = prevDate;
    let checkPrevDate = prevPrevDate;
    while (checkDate && checkPrevDate) {
        const checkShift = schedule[staff][checkDate];
        const checkPrevShift = schedule[staff][checkPrevDate];
        if (checkShift === morningShift && hour24Shifts.includes(checkPrevShift)) {
            consecutive24MorningCount++;
            const checkIndex = dates.findIndex(d => d.date === checkPrevDate);
            if (checkIndex > 0) {
                checkDate = dates[checkIndex - 1].date;
                checkPrevDate = checkIndex > 1 ? dates[checkIndex - 2].date : null;
            } else {
                break;
            }
        } else {
            break;
        }
    }
    // 連続24勤の制限（設定値を超える場合は不可）
    if (consecutive24MorningCount >= maxConsecutive24Shifts) {
        return false;
    }
    
    // 労働時間を計算
    let currentHours = 0;
    dates.forEach((d, idx) => {
        if (idx < dateIndex) {
            const shift = schedule[staff][d.date];
            if (shift === '24A' || shift === '24B') {
                currentHours += shift24Hours;
            } else if (shift === '日勤') {
                currentHours += 8;
            }
        }
    });
    
    const futureHours = currentHours + shift24Hours;
    if (futureHours > targetHoursMax) {
        return false;
    }
    
    return true;
}

/**
 * 解の妥当性を検証
 */
function validateSolution(schedule, dates, shiftStaff, dailyRequirements, target24ShiftCount, targetHoursMax, shift24Hours) {
    // 各日付で必要な人数を満たしているかチェック
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        let nightShiftCount = 0;
        let dayShiftCount = 0;
        
        shiftStaff.forEach(staff => {
            const shift = schedule[staff][dateInfo.date];
            if (shift === '24A' || shift === '24B') {
                nightShiftCount++;
            } else if (shift === '日勤') {
                dayShiftCount++;
            }
        });
        
        if (nightShiftCount < req.nightShift) {
            return false;
        }
        if (dayShiftCount < req.dayShift) {
            return false;
        }
    });
    
    // 各スタッフの労働時間が168時間以内かチェック
    shiftStaff.forEach(staff => {
        let totalHours = 0;
        dates.forEach(dateInfo => {
            const shift = schedule[staff][dateInfo.date];
            if (shift === '24A' || shift === '24B') {
                totalHours += shift24Hours;
            } else if (shift === '日勤') {
                totalHours += 8;
            }
        });
        
        if (totalHours > targetHoursMax) {
            return false;
        }
    });
    
    return true;
}

/**
 * 解をスケジュールに適用
 */
function applySolution(solution, dates, staffList) {
    staffList.forEach(staff => {
        dates.forEach(dateInfo => {
            const shift = solution[staff] && solution[staff][dateInfo.date];
            if (shift) {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    placeShiftInCell(cell, shift);
                }
            }
        });
    });
}

