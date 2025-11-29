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
 * 看護師シフトスケジュールを生成（2段階アプローチ）
 */
function generateNurseShiftSchedule(dates, shiftStaff, dayShiftOnlyStaff, dailyRequirements, config, savedRestDays) {
    // 設定から定数を取得（ハードコーディング削減）
    const constraints = config.constraints || {};
    const shiftHoursConfig = config.shiftHours || {};
    const targetHoursMax = constraints.targetHoursMax || 176;
    const shift24Hours = shiftHoursConfig['24A'] || 16;
    const shiftTypesConfig = config.shiftTypes || {};
    const hour24Shifts = shiftTypesConfig['24HourShifts'] || ['24A', '24B', '夜勤'];
    const morningShift = shiftTypesConfig.morningShift || '明';
    const dayShiftType = shiftTypesConfig.dayShift || '日勤';
    
    // 制約設定を取得
    const maxConsecutive24Shifts = constraints.maxConsecutive24Shifts || 2;
    const preventSamePair = constraints.preventSamePair !== false;
    const samePairPenalty = config.penalties?.samePairPenalty || 100000;
    const hoursDifferenceMultiplier = config.penalties?.hoursDifferenceMultiplier || 100;
    
    // 第1段階：月全体で各スタッフの24勤回数を配分
    const total24ShiftNeeded = dailyRequirements.reduce((sum, req) => sum + req.nightShift, 0);
    const max24ShiftsPerStaff = Math.floor(targetHoursMax / shift24Hours); // 11回
    
    if (shiftStaff.length === 0) {
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
    
    // 前日の24勤担当者ペアを追跡（ペア連続防止用）
    let previousDayPair = [];
    
    // 24勤を日付ごとに割り当て（優先度ベース）
    dates.forEach((dateInfo, dateIndex) => {
        const req = dailyRequirements[dateIndex];
        const requiredNightShift = req.nightShift;
        
        if (requiredNightShift === 0) return; // 24勤が不要な日はスキップ
        
        // 候補者を取得（優先度付き、必要人数のペナルティを含む）
        const candidates = getShiftCandidates(
            schedule, dateInfo.date, shiftStaff, dates, dateIndex,
            target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
            hour24Shifts, morningShift, savedRestDays, requiredNightShift, dailyAssignedCount,
            previousDayPair, preventSamePair, samePairPenalty, maxConsecutive24Shifts,
            hoursDifferenceMultiplier
        );
        
        // 優先度順にソート（同優先度はランダム化して偏りを防ぐ）
        candidates.sort((a, b) => {
            const diff = a.priority - b.priority;
            if (diff !== 0) return diff;
            // 同じ優先度の場合はランダムに並び替え
            return Math.random() - 0.5;
        });
        
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
        
        // 当日の24勤担当者ペアを記録（次の日のペア連続防止用）
        const todaysPair = [];
        shiftStaff.forEach(staff => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (shift === '24A' || shift === '24B') {
                todaysPair.push(staff);
            }
        });
        previousDayPair = todaysPair;
        
        // 必要な人数に達しない場合、制約を緩和して再試行
        if (assigned < requiredNightShift) {
            // 制約を緩和して再試行（連続3回制約を無視、労働時間制約も緩和）
            const relaxedHoursMax = config.constraints?.relaxedHoursMax || 200;
            const relaxedCandidates = getShiftCandidatesRelaxed(
                schedule, dateInfo.date, shiftStaff, dates, dateIndex,
                target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
                hour24Shifts, morningShift, savedRestDays, requiredNightShift, assigned, relaxedHoursMax,
                hoursDifferenceMultiplier
            );
            
            // 優先度順にソート（同優先度はランダム化）
            relaxedCandidates.sort((a, b) => {
                const diff = a.priority - b.priority;
                if (diff !== 0) return diff;
                return Math.random() - 0.5;
            });
            
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
            
        }
    });
    
    // 24勤務者の労働時間を確認し、不足している場合は追加で24勤を割り当て
    const minTargetHours = targetHoursMax - 32; // 最低目標時間（例: 176-32=144時間）
    
    shiftStaff.forEach(staff => {
        // 現在の労働時間を計算
        let currentHours = 0;
        dates.forEach(dateInfo => {
            const shift = schedule[staff][dateInfo.date];
            if (hour24Shifts.includes(shift)) {
                currentHours += shift24Hours;
            }
        });
        
        // 労働時間が不足している場合、空いている日に24勤を追加
        if (currentHours < minTargetHours) {
            dates.forEach((dateInfo, dateIndex) => {
                if (currentHours >= targetHoursMax) return; // 上限に達したら終了
                
                const currentShift = schedule[staff][dateInfo.date];
                if (currentShift && currentShift !== null) return; // 既に割り当てられている
                if (savedRestDays[staff] && savedRestDays[staff][dateInfo.date]) return; // 希望休
                
                // 前日が24勤でないことを確認
                const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
                const prevShift = prevDate ? schedule[staff][prevDate] : null;
                if (hour24Shifts.includes(prevShift)) return; // 前日が24勤なら不可
                
                // 翌日が希望休でないことを確認（「明」を配置するため）
                const nextDate = dateIndex < dates.length - 1 ? dates[dateIndex + 1].date : null;
                if (nextDate && savedRestDays[staff] && savedRestDays[staff][nextDate]) return;
                
                // 24勤を割り当て
                const futureHours = currentHours + shift24Hours;
                if (futureHours <= targetHoursMax) {
                    const shiftType = staff24ShiftCount[staff] % 2 === 0 ? '24A' : '24B';
                    schedule[staff][dateInfo.date] = shiftType;
                    staff24ShiftCount[staff]++;
                    currentHours = futureHours;
                    
                    // 翌日に「明」を配置
                    if (nextDate && (!schedule[staff][nextDate] || schedule[staff][nextDate] === null)) {
                        if (!savedRestDays[staff] || !savedRestDays[staff][nextDate]) {
                            schedule[staff][nextDate] = morningShift;
                        }
                    }
                }
            });
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
    
    // 2連休を確保（月1回以上）- ただし労働時間制約を優先
    ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift, targetHoursMax, shift24Hours);
    
    return schedule;
}

/**
 * シフト候補者を取得（優先度付き）
 */
function getShiftCandidates(
    schedule, date, shiftStaff, dates, dateIndex,
    target24ShiftCount, staff24ShiftCount, targetHoursMax, shift24Hours,
    hour24Shifts, morningShift, savedRestDays, requiredNightShift = 0, dailyAssignedCount = [],
    previousDayPair = [], preventSamePair = true, samePairPenalty = 100000, maxConsecutive24Shifts = 2,
    hoursDifferenceMultiplier = 100
) {
    const candidates = [];
    const prevDate = dateIndex > 0 ? dates[dateIndex - 1].date : null;
    const prevPrevDate = dateIndex > 1 ? dates[dateIndex - 2].date : null;
    
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
    
    if (shiftStaff.length === 0) {
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
        
        // 「24明24明24明」の連続パターンをチェック（設定値まで許可）
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
            
            // 連続24勤の制限（設定値を超える場合は不可）
            if (consecutive24MorningCount >= maxConsecutive24Shifts) {
                canAssign = false;
            }
        }
        
        // 同じペアの連続防止チェック
        let samePairPenaltyValue = 0;
        if (canAssign && preventSamePair && previousDayPair.length > 0) {
            if (previousDayPair.includes(staff)) {
                samePairPenaltyValue = samePairPenalty;
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
            
            // 時間均等化ペナルティ: 平均より多く働いているスタッフにペナルティ
            const hoursDifference = currentHours - averageHours;
            const hoursEqualizationPenalty = hoursDifference * hoursDifferenceMultiplier;
            
            // 目標回数に達していない場合を優先
            // 一意性を高めるため、現在の労働時間とシフト回数を細かく反映
            const uniquenessFactor = currentHours * 0.1 + currentCount * 0.01;
            
            if (remainingCount > 0) {
                priority = shortagePenalty + consecutiveRestBonus + samePairPenaltyValue + hoursEqualizationPenalty - 100000 - (remainingCount * 10000) + (targetHoursMax - currentHours) * 10 + uniquenessFactor;
            } else {
                // 目標回数に達している場合、優先度を下げる（ただし必要人数を満たすことは優先）
                priority = shortagePenalty + consecutiveRestBonus + samePairPenaltyValue + hoursEqualizationPenalty + 50000 + (currentCount - targetCount) * 1000 + uniquenessFactor;
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
            
            // 必要人数を満たすことを最優先（大きなペナルティ）
            const shortage = requiredNightShift - currentAssigned;
            const shortagePenalty = shortage > 0 ? -1000000 * shortage : 0;
            
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
 * 労働時間制約を考慮し、最低労働時間を下回る場合は2連休を作らない
 */
function ensureConsecutiveRestDays(schedule, shiftStaff, dates, savedRestDays, hour24Shifts, morningShift, targetHoursMax = 176, shift24Hours = 16) {
    const restShift = '休';
    const minTargetHours = targetHoursMax - 32; // 最低目標時間
    
    shiftStaff.forEach(staff => {
        // 現在の労働時間を計算
        let currentHours = 0;
        dates.forEach(dateInfo => {
            const shift = schedule[staff]?.[dateInfo.date];
            if (hour24Shifts.includes(shift)) {
                currentHours += shift24Hours;
            }
        });
        
        // 労働時間が最低目標に達していない場合は2連休を作らない
        if (currentHours < minTargetHours) {
            return; // このスタッフはスキップ
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

