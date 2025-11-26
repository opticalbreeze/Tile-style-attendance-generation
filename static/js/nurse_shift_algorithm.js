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
    
    console.log('[看護師シフト] 開始:', {
        dates: dates.length,
        shiftStaff: shiftStaff.length,
        dayShiftOnlyStaff: dayShiftOnlyStaff.length,
        dailyRequirements: dailyRequirements.length
    });
    
    // 2段階アルゴリズムでシフトを生成
    const schedule = generateNurseShiftSchedule(
        dates, shiftStaff, dayShiftOnlyStaff, dailyRequirements, config, savedRestDays
    );
    
    console.log('[看護師シフト] スケジュール生成結果:', schedule);
    
    if (schedule) {
        // スケジュールを適用
        console.log('[看護師シフト] スケジュールを適用中...');
        applyNurseShiftSchedule(schedule, dates, staffList);
        updateSummary();
        alert('看護師シフト自動アテンドが完了しました。\n不足している箇所は手動で調整してください。');
    } else {
        console.error('[看護師シフト] スケジュール生成失敗');
        alert('シフトの生成に失敗しました。制約条件を確認してください。');
    }
}

/**
 * 看護師シフトスケジュールを生成（2段階アプローチ）
 */
function generateNurseShiftSchedule(dates, shiftStaff, dayShiftOnlyStaff, dailyRequirements, config, savedRestDays) {
    const targetHoursMax = 176; // 24勤11回（11回 × 16時間 = 176時間）
    const shift24Hours = 16;
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    
    // 第1段階：月全体で各スタッフの24勤回数を配分
    const total24ShiftNeeded = dailyRequirements.reduce((sum, req) => sum + req.nightShift, 0);
    const max24ShiftsPerStaff = Math.floor(targetHoursMax / shift24Hours); // 11回
    
    console.log(`[看護師シフト] 第1段階: 必要24勤回数=${total24ShiftNeeded}, 24勤務スタッフ数=${shiftStaff.length}, 最大回数/人=${max24ShiftsPerStaff}`);
    
    if (shiftStaff.length === 0) {
        console.error('[看護師シフト] 24勤務スタッフが0人です');
        return null;
    }
    
    // 各スタッフの目標24勤回数を計算（負荷分散）
    const target24ShiftCount = {};
    const staff24ShiftCount = {}; // 実際の割り当て回数
    shiftStaff.forEach(staff => {
        target24ShiftCount[staff] = 0;
        staff24ShiftCount[staff] = 0;
    });
    
    // 負荷分散：各スタッフに均等に配分
    let remainingShifts = total24ShiftNeeded;
    const availableStaff = [...shiftStaff];
    
    while (remainingShifts > 0 && availableStaff.length > 0) {
        // 現在の負荷が最も少ないスタッフを選択
        availableStaff.sort((a, b) => {
            const countA = target24ShiftCount[a] || 0;
            const countB = target24ShiftCount[b] || 0;
            if (countA !== countB) return countA - countB;
            // 同数の場合はランダムに
            return Math.random() - 0.5;
        });
        
        const selectedStaff = availableStaff[0];
        if (target24ShiftCount[selectedStaff] < max24ShiftsPerStaff) {
            target24ShiftCount[selectedStaff]++;
            remainingShifts--;
        } else {
            // 上限に達したスタッフを除外
            availableStaff.shift();
        }
    }
    
    console.log('[看護師シフト] 目標24勤回数:', target24ShiftCount);
    
    // 第2段階：日付ごとに制約を満たしながら割り当て
    const schedule = {};
    
    // 全スタッフのスケジュールを初期化
    shiftStaff.forEach(staff => {
        schedule[staff] = {};
        dates.forEach(dateInfo => {
            if (savedRestDays[staff] && savedRestDays[staff][dateInfo.date]) {
                schedule[staff][dateInfo.date] = savedRestDays[staff][dateInfo.date];
            } else {
                schedule[staff][dateInfo.date] = null;
            }
        });
    });
    
    // 日勤専門スタッフのスケジュールも初期化
    dayShiftOnlyStaff.forEach(staff => {
        schedule[staff] = schedule[staff] || {};
        dates.forEach(dateInfo => {
            if (savedRestDays[staff] && savedRestDays[staff][dateInfo.date]) {
                schedule[staff][dateInfo.date] = savedRestDays[staff][dateInfo.date];
            } else {
                schedule[staff][dateInfo.date] = null;
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
                    // schedule[staff]が存在しない場合は初期化
                    if (!schedule[staff]) {
                        schedule[staff] = {};
                    }
                    if (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date]) {
                        schedule[staff][dateInfo.date] = dayShiftType;
                        dayShiftAssigned++;
                    }
                }
            });
        }
    });
    
    // 第1パス：各日の必要人数を満たすことを優先
    // まず、各日の現在の割り当て状況を確認
    const dailyAssignedCount = new Array(dates.length).fill(0);
    
    // 24勤を日付ごとに割り当て（優先度ベース）
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        const requiredNightShift = req.nightShift;
        
        if (requiredNightShift === 0) return; // 24勤が不要な日はスキップ
        
        // 候補者を取得（優先度付き、必要人数のペナルティを含む）
        const candidates = getShiftCandidates(
            schedule, dateInfo.date, shiftStaff, dates, dateIndex,
            target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
            hour24Shifts, morningShift, savedRestDays, requiredNightShift, dailyAssignedCount
        );
        
        console.log(`[看護師シフト] ${dateInfo.date}: 候補者数=${candidates.length}, 必要人数=${requiredNightShift}`);
        
        // 優先度順にソート
        candidates.sort((a, b) => a.priority - b.priority);
        
        // 必要な人数分だけ割り当て
        let assigned = 0;
        candidates.forEach(candidate => {
            if (assigned < requiredNightShift && candidate.canAssign) {
                // schedule[candidate.staff]が存在することを確認
                if (!schedule[candidate.staff]) {
                    schedule[candidate.staff] = {};
                }
                
                const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                schedule[candidate.staff][dateInfo.date] = shiftType;
                staff24ShiftCount[candidate.staff]++;
                
                // 翌日に「明」を自動配置
                if (dateIndex < dates.length - 1) {
                    const nextDate = dates[dateIndex + 1].date;
                    if (!schedule[candidate.staff][nextDate] || schedule[candidate.staff][nextDate] === null) {
                        if (!savedRestDays[candidate.staff] || !savedRestDays[candidate.staff][nextDate]) {
                            schedule[candidate.staff][nextDate] = morningShift;
                        }
                    }
                }
                
                assigned++;
            }
        });
        
        // 割り当て数を記録
        dailyAssignedCount[dateIndex] = assigned;
        
        // 必要な人数に達しない場合、制約を緩和して再試行
        if (assigned < requiredNightShift) {
            console.log(`警告: ${dateInfo.date}の24勤が不足しています（必要: ${requiredNightShift}人、割り当て: ${assigned}人）`);
            
            // 制約を緩和して再試行（連続3回制約を無視、労働時間制約も緩和）
            const relaxedCandidates = getShiftCandidatesRelaxed(
                schedule, dateInfo.date, shiftStaff, dates, dateIndex,
                target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
                hour24Shifts, morningShift, savedRestDays, requiredNightShift, assigned
            );
            
            relaxedCandidates.sort((a, b) => a.priority - b.priority);
            
            relaxedCandidates.forEach(candidate => {
                if (assigned < requiredNightShift) {
                    // schedule[candidate.staff]が存在することを確認
                    if (!schedule[candidate.staff]) {
                        schedule[candidate.staff] = {};
                    }
                    
                    const shiftType = assigned % 2 === 0 ? '24A' : '24B';
                    schedule[candidate.staff][dateInfo.date] = shiftType;
                    staff24ShiftCount[candidate.staff]++;
                    
                    // 翌日に「明」を自動配置
                    if (dateIndex < dates.length - 1) {
                        const nextDate = dates[dateIndex + 1].date;
                        if (!schedule[candidate.staff][nextDate] || schedule[candidate.staff][nextDate] === null) {
                            if (!savedRestDays[candidate.staff] || !savedRestDays[candidate.staff][nextDate]) {
                                schedule[candidate.staff][nextDate] = morningShift;
                            }
                        }
                    }
                    
                    assigned++;
                }
            });
            
            if (assigned < requiredNightShift) {
                console.warn(`最終警告: ${dateInfo.date}の24勤が不足しています（必要: ${requiredNightShift}人、割り当て: ${assigned}人）`);
            }
        }
    });
    
    // 24勤務者の未割り当て日を「休」にする
    shiftStaff.forEach(staff => {
        dates.forEach(dateInfo => {
            if (!schedule[staff][dateInfo.date] || schedule[staff][dateInfo.date] === null) {
                if (!savedRestDays[staff] || !savedRestDays[staff][dateInfo.date]) {
                    schedule[staff][dateInfo.date] = '休';
                }
            }
        });
    });
    
    // 2連休を確保（月1回以上）
    ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift);
    
    return schedule;
}

/**
 * シフト候補者を取得（優先度付き）
 */
function getShiftCandidates(
    schedule, date, shiftStaff, dates, dateIndex,
    target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
    hour24Shifts, morningShift, savedRestDays, requiredNightShift = 0, dailyAssignedCount = []
) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    
    if (shiftStaff.length === 0) {
        console.warn(`[看護師シフト] ${date}: 24勤務スタッフが0人です`);
        return candidates;
    }
    
    shiftStaff.forEach(staff => {
        // 既にシフトが割り当てられている場合はスキップ
        if (schedule[staff][date] && schedule[staff][date] !== null) {
            return;
        }
        
        // 保存された「休」「有休」「明」がある場合はスキップ
        if (savedRestDays[staff] && savedRestDays[staff][date]) {
            return;
        }
        
        const prevShift = prevDate ? (schedule[staff][prevDate] || null) : null;
        const prevPrevShift = prevPrevDate ? (schedule[staff][prevPrevDate] || null) : null;
        
        // 制約チェック
        let canAssign = true;
        let priority = 0;
        
        // 前日が24勤の場合は不可
        if (hour24Shifts.includes(prevShift)) {
            canAssign = false;
        }
        
        // 「24明24明24明」の連続パターンをチェック（連続3回まで許可）
        if (canAssign) {
            let consecutive24MorningCount = 0;
            let checkShift = prevShift;
            let checkPrevShift = prevPrevShift;
            let checkDate = prevDate;
            let checkPrevDate = prevPrevDate;
            
            while (checkDate && checkPrevDate && checkShift === morningShift && hour24Shifts.includes(checkPrevShift)) {
                consecutive24MorningCount++;
                const checkIndex = dates.findIndex(d => d.date === checkPrevDate);
                if (checkIndex > 0) {
                    checkDate = dates[checkIndex].date;
                    checkPrevDate = checkIndex > 1 ? dates[checkIndex - 1].date : null;
                    checkShift = schedule[staff][checkDate] || null;
                    checkPrevShift = checkPrevDate ? (schedule[staff][checkPrevDate] || null) : null;
                } else {
                    break;
                }
            }
            
            if (consecutive24MorningCount >= 3) {
                canAssign = false;
            }
        }
        
        // 労働時間を計算
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
        
        // 優先度計算
        if (canAssign) {
            const targetCount = target24ShiftCount[staff] || 0;
            const currentCount = staff24ShiftCount[staff] || 0;
            const remainingCount = targetCount - currentCount;
            
            // 必要人数を満たすことを最優先（大きなペナルティ）
            const currentAssigned = dailyAssignedCount[dateIndex] || 0;
            const shortage = requiredNightShift - currentAssigned;
            const shortagePenalty = shortage > 0 ? -1000000 * shortage : 0; // 不足している人数に応じた大きなペナルティ
            
            // 2連休がないスタッフを優先（月1回以上確保）
            const hasConsecutiveRest = hasConsecutiveRestDays(schedule, staff, dates, dateIndex, hour24Shifts, morningShift);
            const consecutiveRestBonus = hasConsecutiveRest ? 0 : -50000; // 2連休がない場合は優先
            
            // 目標回数に達していない場合を優先
            if (remainingCount > 0) {
                priority = shortagePenalty + consecutiveRestBonus - 100000 - (remainingCount * 10000) + (targetHoursMax - currentHours) * 10;
            } else {
                // 目標回数に達している場合、優先度を下げる（ただし必要人数を満たすことは優先）
                priority = shortagePenalty + consecutiveRestBonus + 50000 + (currentCount - targetCount) * 1000;
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
    
    const assignableCount = candidates.filter(c => c.canAssign).length;
    if (assignableCount === 0 && candidates.length > 0) {
        console.warn(`[看護師シフト] ${date}: 割り当て可能な候補者が0人です（全候補者: ${candidates.length}人）`);
    }
    
    return candidates;
}

/**
 * シフト候補者を取得（制約緩和版）
 * 連続3回制約を無視し、労働時間制約も緩和
 */
function getShiftCandidatesRelaxed(
    schedule, date, shiftStaff, dates, dateIndex,
    target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
    hour24Shifts, morningShift, savedRestDays, requiredNightShift = 0, currentAssigned = 0
) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    
    if (shiftStaff.length === 0) {
        return candidates;
    }
    
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
        // 労働時間制約を緩和（200時間まで許可）
        if (futureHours > 200) {
            canAssign = false;
        }
        
        // 優先度計算（制約緩和版）
        if (canAssign) {
            const targetCount = target24ShiftCount[staff] || 0;
            const currentCount = staff24ShiftCount[staff] || 0;
            const remainingCount = targetCount - currentCount;
            
            // 必要人数を満たすことを最優先（大きなペナルティ）
            const shortage = requiredNightShift - currentAssigned;
            const shortagePenalty = shortage > 0 ? -1000000 * shortage : 0;
            
            // 2連休がないスタッフを優先（月1回以上確保）
            const hasConsecutiveRest = hasConsecutiveRestDays(schedule, staff, dates, dateIndex, hour24Shifts, morningShift);
            const consecutiveRestBonus = hasConsecutiveRest ? 0 : -50000; // 2連休がない場合は優先
            
            // 目標回数に達していない場合を優先
            if (remainingCount > 0) {
                priority = shortagePenalty + consecutiveRestBonus - 100000 - (remainingCount * 10000) + (targetHoursMax - currentHours) * 10;
            } else {
                // 目標回数に達している場合、優先度を下げる（ただし必要人数を満たすことは優先）
                priority = shortagePenalty + consecutiveRestBonus + 50000 + (currentCount - targetCount) * 1000 + (futureHours - targetHoursMax) * 100;
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
 */
function ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift) {
    const restShift = '休';
    
    shiftStaff.forEach(staff => {
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
                console.log(`[看護師シフト] ${staff}に2連休を設定: ${bestCandidate.date1}, ${bestCandidate.date2}`);
            } else {
                console.warn(`[看護師シフト] ${staff}に2連休を設定できませんでした`);
            }
        }
    });
}

/**
 * スケジュールを適用
 */
function applyNurseShiftSchedule(schedule, dates, staffList) {
    let appliedCount = 0;
    staffList.forEach(staff => {
        dates.forEach(dateInfo => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (shift) {
                const cell = getDateCell(staff, dateInfo.date);
                if (cell) {
                    placeShiftInCell(cell, shift);
                    appliedCount++;
                }
            }
        });
    });
    console.log(`[看護師シフト] 適用完了: ${appliedCount}個のシフトを配置`);
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

