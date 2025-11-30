// 看護師シフト調整アルゴリズム
// 2段階アプローチ：全体配分 → 日次割り当て

/**
 * 看護師シフト自動アテンド（改善版）
 * 1. 月全体で各スタッフの24勤回数を配分
 * 2. 日付ごとに制約を満たしながら割り当て
 * 3. 完璧を求めず、ある程度アテンドできればOK
 */
function nurseShiftAutoAttend() {
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
        if (excludeCheckbox?.checked) excludedStaff.push(staff);
    });
    
    // 日勤専門スタッフを取得
    const config = window.appData?.config || {};
    const dayShiftOnlyCount = config.staff?.dayShiftOnlyCount || 3;
    const dayShiftOnlyStaff = [];
    for (let i = 0; i < Math.min(dayShiftOnlyCount, staffList.length); i++) {
        const checkbox = document.getElementById(`day-shift-only-${i + 1}`);
        if (checkbox?.checked && !excludedStaff.includes(staffList[i])) {
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
            const shiftContent = cell?.querySelector('.shift-content');
            const shiftType = shiftContent?.dataset.shift;
            
            if (shiftType === '休' || shiftType === '有休' || shiftType === morningShift) {
                if (!savedRestDays[staffName]) savedRestDays[staffName] = {};
                savedRestDays[staffName][dateInfo.date] = shiftType;
            }
        });
    });
    
    // 既存のスケジュールをクリア（「休」「有休」「明」以外）
    clearAllSchedulesExceptRest(savedRestDays);
    
    // 保存した「休」「有休」「明」を復元
    Object.keys(savedRestDays).forEach(staffName => {
        Object.keys(savedRestDays[staffName]).forEach(date => {
            const cell = getDateCell(staffName, date);
            if (cell) placeShiftInCell(cell, savedRestDays[staffName][date]);
        });
    });
    
    // 前月15日のシフトを確認し、16日に「明」を配置
    placeMorningShiftForPrevMonth(dates, staffList, config);
    
    // 各日付で必要な人数を計算
    const requiredStaff = config.requiredStaff || {};
    const weekdayReq = requiredStaff.weekday || { dayShift: 3, nightShift: 3 };
    const weekendReq = requiredStaff.weekend || { nightShift: 3 };
    
    const dailyRequirements = dates.map(dateInfo => {
        const isWeekend = dateInfo.weekday_jp === '土' || dateInfo.weekday_jp === '日';
        return {
            date: dateInfo.date,
            dayShift: isWeekend ? 0 : (weekdayReq.dayShift || 3),
            nightShift: isWeekend ? (weekendReq.nightShift || 3) : (weekdayReq.nightShift || 3)
        };
    });
    
    // 2段階アルゴリズムでシフトを生成
    const schedule = generateNurseShiftSchedule(
        dates, shiftStaff, dayShiftOnlyStaff, dailyRequirements, config, savedRestDays
    );
    
    if (schedule) {
        // スケジュールを適用
        applyNurseShiftSchedule(schedule, dates, staffList, savedRestDays);
        updateSummary();
        alert('看護師シフト自動アテンドが完了しました。\n不足している箇所は手動で調整してください。');
    } else {
        alert('シフトの生成に失敗しました。制約条件を確認してください。');
    }
}

/**
 * 看護師シフトスケジュールを生成（希望休を考慮した前方参照型アルゴリズム）
 * 休み回数ベースで平準化（31日→9休、30日→8休）
 */
function generateNurseShiftSchedule(dates, shiftStaff, dayShiftOnlyStaff, dailyRequirements, config, savedRestDays) {
    // 設定から定数を取得
    const constraints = config.constraints || {};
    const shiftHoursConfig = config.shiftHours || {};
    const targetHoursMax = constraints.targetHoursMax || 176;
    const shift24Hours = shiftHoursConfig['24A'] || 16;
    const dayShiftHours = shiftHoursConfig['日勤'] || 8;
    const paidLeaveHours = shiftHoursConfig['有休'] || 8;
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    const paidLeaveType = shiftTypesConfig.paidLeave || '有休';
    
    const maxConsecutive24Shifts = constraints.maxConsecutive24Shifts || 2;
    const preventSamePair = constraints.preventSamePair !== false;
    const samePairPenalty = config.penalties?.samePairPenalty || 100000;
    const hoursDifferenceMultiplier = config.penalties?.hoursDifferenceMultiplier || 100;
    
    // 🆕 休み回数ベースの平準化設定
    const totalDays = dates.length;
    const restDaysFor31 = constraints.restDaysFor31 || 9;
    const restDaysFor30 = constraints.restDaysFor30 || 8;
    // 月度の日数に応じた目標休み回数（有休は含まない）
    const targetRestDays = totalDays >= 31 ? restDaysFor31 : restDaysFor30;
    
    const total24ShiftNeeded = dailyRequirements.reduce((sum, req) => sum + req.nightShift, 0);
    const max24ShiftsPerStaff = Math.floor(targetHoursMax / shift24Hours);
    
    if (shiftStaff.length === 0) return null;
    
    // 🆕 各スタッフの配置可能日数と希望休の影響を事前計算
    const staffAvailability = {};
    shiftStaff.forEach(staff => {
        let availableDays = 0;
        let restDaysCount = 0;      // 「休」のみカウント（有休は含まない）
        let paidLeaveDaysCount = 0; // 「有休」のカウント
        
        dates.forEach((dateInfo, idx) => {
            const savedShift = savedRestDays[staff]?.[dateInfo.date];
            
            if (savedShift) {
                // 有休と休を区別してカウント
                if (savedShift === paidLeaveType) {
                    paidLeaveDaysCount++;
                } else if (savedShift === '休') {
                    restDaysCount++;
                }
            } else {
                // 前日が希望休でない、かつ翌日に配置余地がある場合のみカウント
                const prevDate = idx > 0 ? dates[idx - 1].date : null;
                const prevIsRest = prevDate && savedRestDays[staff]?.[prevDate];
                const nextDate = idx < dates.length - 1 ? dates[idx + 1].date : null;
                const nextIsRest = nextDate && savedRestDays[staff]?.[nextDate];
                
                // 24勤+明で2日必要なので、翌日が希望休なら配置不可
                if (!prevIsRest && !nextIsRest) {
                    availableDays++;
                }
            }
        });
        
        // 🆕 残り必要な休み回数を計算（目標 - 既存の「休」）
        const remainingRestDaysNeeded = Math.max(0, targetRestDays - restDaysCount);
        
        staffAvailability[staff] = {
            availableDays: availableDays,
            restDaysCount: restDaysCount,           // 「休」のみ
            paidLeaveDaysCount: paidLeaveDaysCount, // 「有休」
            remainingRestDaysNeeded: remainingRestDaysNeeded,
            maxPossible24Shifts: Math.min(
                Math.floor(availableDays / 2), // 24勤+明で2日必要
                max24ShiftsPerStaff
            )
        };
    });
    
    // 🆕 希望休を考慮した動的な目標回数設定
    const target24ShiftCount = {};
    const staff24ShiftCount = {};
    
    // ステップ1: 各スタッフの配置可能性に応じた重み付け
    const totalAvailableCapacity = shiftStaff.reduce((sum, staff) => {
        return sum + staffAvailability[staff].maxPossible24Shifts;
    }, 0);
    
    shiftStaff.forEach(staff => {
        const availability = staffAvailability[staff];
        // 配置可能日数に応じて目標回数を按分
        const proportionalTarget = totalAvailableCapacity > 0 
            ? Math.floor((availability.maxPossible24Shifts / totalAvailableCapacity) * total24ShiftNeeded)
            : 0;
        
        target24ShiftCount[staff] = Math.min(proportionalTarget, availability.maxPossible24Shifts);
        staff24ShiftCount[staff] = 0;
    });
    
    // ステップ2: 残りのシフトを配置可能なスタッフに振り分け
    let assignedTotal = Object.values(target24ShiftCount).reduce((a, b) => a + b, 0);
    let remainingShifts = total24ShiftNeeded - assignedTotal;
    
    while (remainingShifts > 0) {
        // まだ余裕があるスタッフを探す
        const availableStaff = shiftStaff.filter(staff => 
            target24ShiftCount[staff] < staffAvailability[staff].maxPossible24Shifts
        ).sort((a, b) => target24ShiftCount[a] - target24ShiftCount[b]);
        
        if (availableStaff.length === 0) break;
        
        target24ShiftCount[availableStaff[0]]++;
        remainingShifts--;
    }
    
    // スケジュール初期化
    const schedule = {};
    
    shiftStaff.forEach(staff => {
        schedule[staff] = {};
        dates.forEach(dateInfo => {
            schedule[staff][dateInfo.date] = savedRestDays[staff]?.[dateInfo.date] || null;
        });
    });
    
    dayShiftOnlyStaff.forEach(staff => {
        schedule[staff] = schedule[staff] || {};
        dates.forEach(dateInfo => {
            schedule[staff][dateInfo.date] = savedRestDays[staff]?.[dateInfo.date] || null;
        });
    });
    
    // 日勤専門スタッフの日勤割り当て
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        if (req.dayShift > 0) {
            let dayShiftAssigned = 0;
            dayShiftOnlyStaff.forEach(staff => {
                if (dayShiftAssigned < req.dayShift && 
                    (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date])) {
                    if (!schedule[staff]) schedule[staff] = {};
                    schedule[staff][dateInfo.date] = dayShiftType;
                    dayShiftAssigned++;
                }
            });
        }
    });
    
    const dailyAssignedCount = new Array(dates.length).fill(0);
    let previousDayPair = [];
    
    // 🆕 24勤割り当て（前方参照型 - 残り日数を考慮）
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        const requiredNightShift = req.nightShift;
        
        if (requiredNightShift === 0) return;
        
        // 🆕 残り日数を考慮した優先度計算
        const remainingDates = dates.length - dateIndex;
        
        const candidates = getShiftCandidatesWithForwardLooking(
            schedule, dateInfo.date, shiftStaff, dates, dateIndex,
            target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
            hour24Shifts, morningShift, savedRestDays, requiredNightShift, dailyAssignedCount,
            previousDayPair, preventSamePair, samePairPenalty, maxConsecutive24Shifts,
            hoursDifferenceMultiplier, staffAvailability, remainingDates
        );
        
        candidates.sort((a, b) => {
            const diff = a.priority - b.priority;
            if (diff !== 0) return diff;
            return Math.random() - 0.5;
        });
        
        let assigned = 0;
        candidates.forEach(candidate => {
            if (assigned < requiredNightShift && candidate.canAssign) {
                if (!schedule[candidate.staff]) schedule[candidate.staff] = {};
                
                const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                schedule[candidate.staff][dateInfo.date] = shiftType;
                staff24ShiftCount[candidate.staff]++;
                
                // 翌日に「明」を配置
                if (dateIndex < dates.length - 1) {
                    const nextDate = dates[dateIndex + 1].date;
                    if (!schedule[candidate.staff][nextDate] && 
                        (!savedRestDays[candidate.staff] || !savedRestDays[candidate.staff][nextDate])) {
                        schedule[candidate.staff][nextDate] = morningShift;
                    }
                }
                
                assigned++;
            }
        });
        
        dailyAssignedCount[dateIndex] = assigned;
        
        // 当日のペアを記録
        const todaysPair = [];
        shiftStaff.forEach(staff => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (shift === '24A' || shift === '24B') {
                todaysPair.push(staff);
            }
        });
        previousDayPair = todaysPair;
        
        // 必要人数に達しない場合の緩和処理
        if (assigned < requiredNightShift) {
            const relaxedHoursMax = config.constraints?.relaxedHoursMax || 200;
            const relaxedCandidates = getShiftCandidatesRelaxed(
                schedule, dateInfo.date, shiftStaff, dates, dateIndex,
                target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
                hour24Shifts, morningShift, savedRestDays, requiredNightShift, assigned, relaxedHoursMax,
                hoursDifferenceMultiplier
            );
            
            relaxedCandidates.sort((a, b) => a.priority - b.priority || Math.random() - 0.5);
            
            relaxedCandidates.forEach(candidate => {
                if (assigned < requiredNightShift) {
                    if (!schedule[candidate.staff]) schedule[candidate.staff] = {};
                    
                    const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                    schedule[candidate.staff][dateInfo.date] = shiftType;
                    staff24ShiftCount[candidate.staff]++;
                    
                    if (dateIndex < dates.length - 1) {
                        const nextDate = dates[dateIndex + 1].date;
                        if (!schedule[candidate.staff][nextDate] && 
                            (!savedRestDays[candidate.staff] || !savedRestDays[candidate.staff][nextDate])) {
                            schedule[candidate.staff][nextDate] = morningShift;
                        }
                    }
                    
                    assigned++;
                }
            });
        }
    });
    
    // 🆕 目標時間に達しない場合、日勤で補完
    const minTargetHours = targetHoursMax - 32;
    
    shiftStaff.forEach(staff => {
        let currentHours = 0;
        dates.forEach(dateInfo => {
            const shift = schedule[staff][dateInfo.date];
            if (hour24Shifts.includes(shift)) {
                currentHours += shift24Hours;
            } else if (shift === dayShiftType) {
                currentHours += dayShiftHours;
            }
        });
        
        // 時間不足の場合、平日に日勤を配置
        if (currentHours < minTargetHours) {
            dates.forEach((dateInfo, dateIndex) => {
                if (currentHours >= targetHoursMax) return;
                
                const currentShift = schedule[staff][dateInfo.date];
                const isWeekday = dateInfo.weekday_jp !== '土' && dateInfo.weekday_jp !== '日';
                const canReplace = (currentShift === null || currentShift === '休') && 
                                  (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date]);
                
                if (isWeekday && canReplace) {
                    schedule[staff][dateInfo.date] = dayShiftType;
                    currentHours += dayShiftHours;
                }
            });
        }
    });
    
    // 🆕 休み回数ベースの平準化
    // 未割り当て日を処理し、目標休み回数に調整
    shiftStaff.forEach(staff => {
        // 現在の休み回数をカウント（「休」のみ、有休は含まない）
        let currentRestCount = 0;
        let unassignedDays = [];
        
        dates.forEach((dateInfo, idx) => {
            const shift = schedule[staff][dateInfo.date];
            if (shift === '休') {
                currentRestCount++;
            } else if (!shift || shift === null) {
                // 未割り当て日をリストに追加
                if (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date]) {
                    unassignedDays.push({ date: dateInfo.date, index: idx, weekday: dateInfo.weekday_jp });
                }
            }
        });
        
        // 目標休み回数との差を計算
        const restDaysNeeded = targetRestDays - currentRestCount;
        
        if (restDaysNeeded > 0 && unassignedDays.length > 0) {
            // 休みを追加する必要がある場合
            // 土日を優先して休みに
            const weekendDays = unassignedDays.filter(d => d.weekday === '土' || d.weekday === '日');
            const weekdayDays = unassignedDays.filter(d => d.weekday !== '土' && d.weekday !== '日');
            
            let restAssigned = 0;
            
            // まず土日を「休」に
            weekendDays.forEach(day => {
                if (restAssigned < restDaysNeeded) {
                    schedule[staff][day.date] = '休';
                    restAssigned++;
                }
            });
            
            // 足りない場合は平日も「休」に
            weekdayDays.forEach(day => {
                if (restAssigned < restDaysNeeded) {
                    schedule[staff][day.date] = '休';
                    restAssigned++;
                }
            });
            
            // 残りの未割り当て日は日勤に（平日のみ）
            unassignedDays.forEach(day => {
                if (!schedule[staff][day.date] || schedule[staff][day.date] === null) {
                    const isWeekday = day.weekday !== '土' && day.weekday !== '日';
                    if (isWeekday) {
                        schedule[staff][day.date] = dayShiftType;
                    } else {
                        schedule[staff][day.date] = '休';
                    }
                }
            });
        } else {
            // 休み回数が既に目標に達している場合
            // 残りの未割り当て日は日勤（平日）または休（土日）に
            unassignedDays.forEach(day => {
                const isWeekday = day.weekday !== '土' && day.weekday !== '日';
                if (isWeekday) {
                    schedule[staff][day.date] = dayShiftType;
                } else {
                    schedule[staff][day.date] = '休';
                }
            });
        }
    });
    
    // 2連休の確保
    ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift, targetRestDays, shift24Hours);
    
    return schedule;
}

/**
 * 🆕 前方参照型候補者取得（残り日数を考慮）
 */
function getShiftCandidatesWithForwardLooking(
    schedule, date, shiftStaff, dates, dateIndex,
    target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
    hour24Shifts, morningShift, savedRestDays, requiredNightShift, dailyAssignedCount,
    previousDayPair, preventSamePair, samePairPenalty, maxConsecutive24Shifts,
    hoursDifferenceMultiplier, staffAvailability, remainingDates
) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    
    // 翌日の日付を取得（24勤配置時に「明」を配置するため）
    const nextDate = dateIndex < dates.length - 1 ? dates[dateIndex + 1].date : null;
    
    shiftStaff.forEach(staff => {
        if (schedule[staff][date] && schedule[staff][date] !== null) return;
        if (savedRestDays[staff]?.[date]) return;
        
        const prevShift = prevDate ? (schedule[staff][prevDate] || null) : null;
        const prevPrevShift = prevPrevDate ? (schedule[staff][prevPrevDate] || null) : null;
        
        let canAssign = true;
        let priority = 0;
        
        // 前日が24勤なら不可
        if (hour24Shifts.includes(prevShift)) {
            canAssign = false;
        }
        
        // 翌日が希望休の場合は不可（24勤配置後に「明」を配置できないため）
        if (canAssign && nextDate && savedRestDays[staff]?.[nextDate]) {
            canAssign = false;
        }
        
        // 連続24勤制約チェック（24→明→24→明→... のパターン）
        // 前日が「明」の場合のみチェック（24勤の翌日は必ず明になる）
        if (canAssign && prevShift === morningShift) {
            let consecutive24Count = 0;
            let checkIdx = dateIndex - 1; // 前日（明）のインデックス
            
            // 「明→24勤」のペアを遡ってカウント
            while (checkIdx >= 1) {
                const morningDate = dates[checkIdx]?.date;
                const prev24Date = dates[checkIdx - 1]?.date;
                
                const morningCheck = morningDate ? schedule[staff][morningDate] : null;
                const prev24Check = prev24Date ? schedule[staff][prev24Date] : null;
                
                if (morningCheck === morningShift && hour24Shifts.includes(prev24Check)) {
                    consecutive24Count++;
                    checkIdx -= 2; // 2日前にジャンプ（24勤→明で2日分）
                } else {
                    break;
                }
            }
            
            if (consecutive24Count >= maxConsecutive24Shifts) {
                canAssign = false;
            }
        }
        
        // ペア連続防止
        let samePairPenaltyValue = 0;
        if (canAssign && preventSamePair && previousDayPair.includes(staff)) {
            samePairPenaltyValue = samePairPenalty;
        }
        
        // 現在の労働時間計算
        let currentHours = 0;
        dates.forEach((d, idx) => {
            if (idx < dateIndex) {
                const shift = schedule[staff][d.date];
                if (hour24Shifts.includes(shift)) {
                    currentHours += shift24Hours;
                }
            }
        });
        
        const futureHours = currentHours + shift24Hours;
        if (futureHours > targetHoursMax) {
            canAssign = false;
        }
        
        // 🆕 進捗率ベースの優先度（遅れているスタッフを優先）
        const currentProgress = staff24ShiftCount[staff] || 0;
        const targetProgress = target24ShiftCount[staff] || 0;
        const expectedProgress = dates.length > 0 ? (dateIndex / dates.length) * targetProgress : 0;
        const progressGap = expectedProgress - currentProgress;
        
        // 遅れている場合は優先度を高く（マイナス値 = 高優先度）
        const progressPenalty = -progressGap * 10000;
        
        // 時間均等化ペナルティ
        const totalHoursAll = shiftStaff.reduce((sum, s) => {
            let h = 0;
            dates.forEach((d, idx) => {
                if (idx < dateIndex && hour24Shifts.includes(schedule[s]?.[d.date])) {
                    h += shift24Hours;
                }
            });
            return sum + h;
        }, 0);
        const averageHours = shiftStaff.length > 0 ? totalHoursAll / shiftStaff.length : 0;
        const hoursDiff = Math.abs(futureHours - averageHours);
        const hoursBalancePenalty = hoursDiff * hoursDifferenceMultiplier;
        
        // 🆕 残り日数リスクペナルティ
        const remainingTargetShifts = targetProgress - currentProgress;
        const remainingAvailableDays = staffAvailability[staff]?.availableDays || remainingDates;
        const riskFactor = remainingAvailableDays > 0 ? remainingTargetShifts / remainingAvailableDays : 0;
        const riskPenalty = riskFactor > 0.5 ? -riskFactor * 5000 : 0; // リスク高い場合は優先
        
        priority = samePairPenaltyValue + hoursBalancePenalty + progressPenalty + riskPenalty;
        
        candidates.push({
            staff: staff,
            canAssign: canAssign,
            priority: priority,
            progressGap: progressGap,
            riskFactor: riskFactor
        });
    });
    
    return candidates;
}


/**
 * シフト候補者を取得（制約緩和版）
 * 連続3回制約を無視し、労働時間制約も緩和
 */
function getShiftCandidatesRelaxed(
    schedule, date, shiftStaff, dates, dateIndex,
    target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
    hour24Shifts, morningShift, savedRestDays, requiredNightShift = 0, currentAssigned = 0, relaxedHoursMax = 200,
    hoursDifferenceMultiplier = 100
) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const nextDate = dateIndex < dates.length - 1 ? dates[dateIndex + 1].date : null;
    
    if (shiftStaff.length === 0) {
        return candidates;
    }
    
    // 全スタッフの現在の労働時間を計算（平均計算用）
    let totalHoursAll = 0;
    let staffCountWithHours = 0;
    shiftStaff.forEach(s => {
        let hours = 0;
        dates.forEach((d, idx) => {
            if (idx < dateIndex) {
                const shift = schedule[s]?.[d.date];
                if (hour24Shifts.includes(shift)) {
                    hours += shift24Hours;
                }
            }
        });
        totalHoursAll += hours;
        staffCountWithHours++;
    });
    const averageHours = staffCountWithHours > 0 ? totalHoursAll / staffCountWithHours : 0;
    
    shiftStaff.forEach(staff => {
        // 既にシフトが割り当てられている場合はスキップ
        if (schedule[staff] && schedule[staff][date] && schedule[staff][date] !== null) {
            return;
        }
        
        // 保存された「休」「有休」「明」がある場合はスキップ
        if (savedRestDays[staff] && savedRestDays[staff][date]) {
            return;
        }
        
        const prevShift = prevDate ? (schedule[staff]?.[prevDate] || null) : null;
        
        // 制約チェック（緩和版）
        let canAssign = true;
        let priority = 0;
        
        // 前日が24勤の場合は不可（これは必須制約）
        if (hour24Shifts.includes(prevShift)) {
            canAssign = false;
        }
        
        // 翌日が希望休の場合は不可（24勤配置後に「明」を配置できないため）
        if (canAssign && nextDate && savedRestDays[staff]?.[nextDate]) {
            canAssign = false;
        }
        
        // 労働時間を計算
        let currentHours = 0;
        dates.forEach((d, idx) => {
            if (idx < dateIndex) {
                const shift = schedule[staff]?.[d.date];
                if (hour24Shifts.includes(shift)) {
                    currentHours += shift24Hours;
                }
            }
        });
        
        const futureHours = currentHours + shift24Hours;
        // 労働時間制約を緩和
        if (futureHours > relaxedHoursMax) {
            canAssign = false;
        }
        
        // 優先度計算（制約緩和版）
        if (canAssign) {
            const targetCount = target24ShiftCount[staff] || 0;
            const currentCount = staff24ShiftCount[staff] || 0;
            const remainingCount = targetCount - currentCount;
            
            // 必要人数を満たすことを最優先（configからペナルティ値を取得）
            const config = window.appData?.config || {};
            const requiredStaffPenaltyBase = config.penalties?.requiredStaffPenalty || 1000000;
            const shortage = requiredNightShift - currentAssigned;
            const shortagePenalty = shortage > 0 ? -requiredStaffPenaltyBase * shortage : 0;
            
            // 2連休がないスタッフを優先（月1回以上確保）
            const hasConsecutiveRest = hasConsecutiveRestDays(schedule, staff, dates, dateIndex, hour24Shifts, morningShift);
            const consecutiveRestBonus = hasConsecutiveRest ? 0 : -50000; // 2連休がない場合は優先
            
            // 時間均等化ペナルティ: 平均より多く働いているスタッフにペナルティ
            const hoursDifference = currentHours - averageHours;
            const hoursEqualizationPenalty = hoursDifference * hoursDifferenceMultiplier;
            
            // 一意性を高めるため、現在の労働時間とシフト回数を細かく反映
            const uniquenessFactor = currentHours * 0.1 + currentCount * 0.01;
            
            // 目標回数に達していない場合を優先
            if (remainingCount > 0) {
                priority = shortagePenalty + consecutiveRestBonus + hoursEqualizationPenalty - 100000 - (remainingCount * 10000) + (targetHoursMax - currentHours) * 10 + uniquenessFactor;
            } else {
                // 目標回数に達している場合、優先度を下げる（ただし必要人数を満たすことは優先）
                priority = shortagePenalty + consecutiveRestBonus + hoursEqualizationPenalty + 50000 + (currentCount - targetCount) * 1000 + (futureHours - targetHoursMax) * 100 + uniquenessFactor;
            }
        } else {
            priority = Infinity;
        }
        
        candidates.push({
            staff,
            priority,
            canAssign,
            currentHours,
            currentCount: staff24ShiftCount[staff] || 0
        });
    });
    
    return candidates;
}

/**
 * 2連休を持っているかチェック
 */
function hasConsecutiveRestDays(schedule, staff, dates, currentDateIndex, hour24Shifts, morningShift) {
    const restShift = '休';
    
    for (let i = 0; i < currentDateIndex - 1; i++) {
        const date1 = dates[i].date;
        const date2 = dates[i + 1].date;
        
        const shift1 = schedule[staff]?.[date1];
        const shift2 = schedule[staff]?.[date2];
        
        // 両方とも「休」で、24勤や「明」でない場合
        if (shift1 === restShift && shift2 === restShift) {
            // 前日が24勤でないことを確認（24勤の翌日は「明」になるため）
            if (i > 0) {
                const prevDate = dates[i - 1].date;
                const prevShift = schedule[staff]?.[prevDate];
                if (!hour24Shifts.includes(prevShift)) {
                    return true; // 2連休が見つかった
                }
            } else {
                return true; // 月初の2連休
            }
        }
    }
    
    return false;
}

/**
 * 2連休を確保（月1回以上）
 * 休み回数制約を考慮し、目標休み回数を超える場合は2連休を作らない
 */
function ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift, targetRestDays = 9, shift24Hours = 16) {
    const restShift = '休';
    
    shiftStaff.forEach(staff => {
        // 現在の休み回数をカウント（「休」のみ、有休は含まない）
        let currentRestCount = 0;
        dates.forEach(dateInfo => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (shift === restShift) {
                currentRestCount++;
            }
        });
        
        // 休み回数が目標を超える場合は2連休を作らない（休みを増やさない）
        if (currentRestCount >= targetRestDays) {
            return; // このスタッフはスキップ（既に十分な休みがある）
        }
        
        // 既に2連休があるかチェック
        let hasConsecutiveRest = false;
        for (let i = 0; i < dates.length - 1; i++) {
            const date1 = dates[i].date;
            const date2 = dates[i + 1].date;
            
            const shift1 = schedule[staff]?.[date1];
            const shift2 = schedule[staff]?.[date2];
            
            // 保存された休みがある場合はスキップ
            if (savedRestDays[staff] && (savedRestDays[staff][date1] || savedRestDays[staff][date2])) {
                continue;
            }
            
            // 両方とも「休」で、24勤や「明」でない場合
            if (shift1 === restShift && shift2 === restShift) {
                // 前日が24勤でないことを確認
                if (i > 0) {
                    const prevDate = dates[i - 1].date;
                    const prevShift = schedule[staff]?.[prevDate];
                    if (!hour24Shifts.includes(prevShift)) {
                        hasConsecutiveRest = true;
                        break;
                    }
                } else {
                    hasConsecutiveRest = true;
                    break;
                }
            }
        }
        
        // 2連休がない場合、適切な場所を見つけて2連休を作る
        if (!hasConsecutiveRest) {
            // 24勤の間隔を考慮して、2連休を挿入できる場所を探す
            // 優先順位：24勤の3日後以降 > 24勤の2日後以降 > その他
            let bestCandidate = null;
            let bestPriority = -1;
            
            for (let i = 0; i < dates.length - 1; i++) {
                const date1 = dates[i].date;
                const date2 = dates[i + 1].date;
                
                // 保存された休みがある場合はスキップ
                if (savedRestDays[staff] && (savedRestDays[staff][date1] || savedRestDays[staff][date2])) {
                    continue;
                }
                
                const shift1 = schedule[staff]?.[date1];
                const shift2 = schedule[staff]?.[date2];
                
                // 既に「明」が設定されている場合は変更しない（24勤の翌日）
                if (shift1 === morningShift || shift2 === morningShift) {
                    continue;
                }
                
                // 前日が24勤でないことを確認
                const prevDate = i > 0 ? dates[i - 1].date : null;
                const prevShift = prevDate ? (schedule[staff]?.[prevDate] || null) : null;
                
                // 24勤の翌日が「明」になっている場合は変更しない
                if (prevShift && hour24Shifts.includes(prevShift)) {
                    continue;
                }
                
                // 後日が24勤でないことを確認（翌々日までチェック）
                const nextNextDate = i + 2 < dates.length ? dates[i + 2].date : null;
                const nextNextShift = nextNextDate ? (schedule[staff]?.[nextNextDate] || null) : null;
                
                // 24勤の制約を満たす場合
                if (!hour24Shifts.includes(prevShift) && 
                    !hour24Shifts.includes(shift1) && 
                    !hour24Shifts.includes(shift2) &&
                    !hour24Shifts.includes(nextNextShift)) {
                    
                    // 優先度を計算（24勤からの距離が遠いほど優先）
                    let priority = 0;
                    // 前々日まで遡って24勤を探す
                    for (let j = Math.max(0, i - 5); j < i; j++) {
                        const checkDate = dates[j].date;
                        const checkShift = schedule[staff]?.[checkDate];
                        if (hour24Shifts.includes(checkShift)) {
                            const distance = i - j;
                            priority = distance; // 24勤からの距離
                            break;
                        }
                    }
                    
                    // 優先度が高い候補を選択
                    if (priority > bestPriority || (priority === bestPriority && Math.random() > 0.5)) {
                        bestCandidate = { date1, date2, index: i };
                        bestPriority = priority;
                    }
                }
            }
            
            // 最適な候補が見つかった場合、2連休を設定
            if (bestCandidate) {
                schedule[staff][bestCandidate.date1] = restShift;
                schedule[staff][bestCandidate.date2] = restShift;
            }
        }
    });
}

/**
 * スケジュールを適用
 * savedRestDays: 事前に保存された希望休（これに含まれない「休」は自動配置扱い）
 */
function applyNurseShiftSchedule(schedule, dates, staffList, savedRestDays = {}) {
    let appliedCount = 0;
    let autoRestCount = 0;
    
    staffList.forEach(staff => {
        dates.forEach(dateInfo => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (shift) {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    // 「休」の場合、事前に保存されていたかどうかをチェック
                    const isAutoAssigned = (shift === '休' && 
                        (!savedRestDays[staff] || savedRestDays[staff][dateInfo.date] !== '休'));
                    
                    placeShiftInCell(cell, shift, isAutoAssigned);
                    appliedCount++;
                    
                    if (isAutoAssigned) {
                        autoRestCount++;
                    }
                }
            }
        });
    });
}

/**
 * 前月15日のシフトを確認し、16日に「明」を配置
 */
function placeMorningShiftForPrevMonth(dates, staffList, config) {
    const periodData = window.appData.periodData || {};
    const startDate = periodData.start_date;
    
    if (!startDate || dates.length === 0) return;
    
    const startDateObj = new Date(startDate + 'T00:00:00');
    startDateObj.setDate(startDateObj.getDate() - 1);
    const prevMonth15th = startDateObj.toISOString().split('T')[0];
    const firstDate = dates[0].date;
    
    const shiftTypes = getShiftTypes(config);
    const { hour24Shifts, morningShift } = shiftTypes;
    
    staffList.forEach(staffName => {
        let prevShift = scheduleData[staffName]?.[prevMonth15th];
        if (!prevShift) {
            try {
                const savedData = localStorage.getItem('scheduleData');
                if (savedData) {
                    prevShift = JSON.parse(savedData)[staffName]?.[prevMonth15th];
                }
            } catch (e) {}
        }
        
        if (prevShift && hour24Shifts.includes(prevShift)) {
            const cell = getDateCell(staffName, firstDate);
            if (cell && !cell.querySelector('.shift-content')) {
                placeShiftInCell(cell, morningShift);
            }
        }
    });
}

/**
 * シフトタイプを取得
 */
function getShiftTypes(config) {
    const shiftTypesConfig = config.shiftTypes || {};
    return {
        hour24Shifts: shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'],
        morningShift: shiftTypesConfig.morningShift || '明',
        dayShiftType: shiftTypesConfig.dayShift || '日勤',
        restShift: shiftTypesConfig.rest || '休'
    };
}

