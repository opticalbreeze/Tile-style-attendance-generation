// 共通ユーティリティモジュール
// コード重複を削減し、共通処理を集約

window.Utils = (function() {
    
    // DOMキャッシュ
    const domCache = new Map();
    const CACHE_TTL = 5000; // 5秒でキャッシュ無効化
    
    /**
     * DOM要素を取得（キャッシュ付き）
     * @param {string} selector - CSSセレクタ
     * @param {boolean} forceRefresh - キャッシュを無視して再取得
     * @returns {Element|null}
     */
    function getElement(selector, forceRefresh = false) {
        const now = Date.now();
        const cached = domCache.get(selector);
        
        if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL)) {
            return cached.element;
        }
        
        const element = document.querySelector(selector);
        domCache.set(selector, { element, timestamp: now });
        return element;
    }
    
    /**
     * DOM要素を複数取得（キャッシュ付き）
     * @param {string} selector - CSSセレクタ
     * @param {boolean} forceRefresh - キャッシュを無視して再取得
     * @returns {NodeList}
     */
    function getElements(selector, forceRefresh = false) {
        const cacheKey = `all:${selector}`;
        const now = Date.now();
        const cached = domCache.get(cacheKey);
        
        if (!forceRefresh && cached && (now - cached.timestamp < CACHE_TTL)) {
            return cached.elements;
        }
        
        const elements = document.querySelectorAll(selector);
        domCache.set(cacheKey, { elements, timestamp: now });
        return elements;
    }
    
    /**
     * DOMキャッシュをクリア
     */
    function clearDomCache() {
        domCache.clear();
    }
    
    /**
     * 安全にプロパティにアクセス
     * @param {Object} obj - オブジェクト
     * @param {string} path - プロパティパス（例: 'config.staff.list'）
     * @param {*} defaultValue - デフォルト値
     * @returns {*}
     */
    function safeGet(obj, path, defaultValue = null) {
        if (!obj || typeof path !== 'string') return defaultValue;
        
        const keys = path.split('.');
        let current = obj;
        
        for (const key of keys) {
            if (current === null || current === undefined) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current !== undefined ? current : defaultValue;
    }
    
    /**
     * 設定を取得
     * @returns {Object}
     */
    function getConfig() {
        return safeGet(window, 'appData.config', {});
    }
    
    /**
     * シフト設定を取得
     * @returns {Object}
     */
    function getShiftTypesConfig() {
        return safeGet(getConfig(), 'shiftTypes', {
            '24HourShifts': ['24A', '24B', '夜勤'],
            'dayShift': '日勤',
            'morningShift': '明',
            'rest': '休',
            'paidLeave': '有休'
        });
    }
    
    /**
     * 24時間シフトの配列を取得
     * @returns {string[]}
     */
    function get24HourShifts() {
        return safeGet(getShiftTypesConfig(), '24HourShifts', ['24A', '24B', '夜勤']);
    }
    
    /**
     * シフトが24時間勤務かどうか
     * @param {string} shiftType
     * @returns {boolean}
     */
    function is24HourShift(shiftType) {
        return get24HourShifts().includes(shiftType);
    }
    
    /**
     * 制約設定を取得
     * @returns {Object}
     */
    function getConstraints() {
        return safeGet(getConfig(), 'constraints', {
            maxConsecutive24Shifts: 2,
            preventSamePair: true,
            targetHoursMax: 176,
            relaxedHoursMax: 200
        });
    }
    
    /**
     * ペナルティ設定を取得
     * @returns {Object}
     */
    function getPenalties() {
        return safeGet(getConfig(), 'penalties', {
            continuousShift: 1000,
            hoursDifferenceMultiplier: 100,
            samePairPenalty: 100000
        });
    }
    
    /**
     * 必要スタッフ数設定を取得
     * @returns {Object}
     */
    function getRequiredStaff() {
        return safeGet(getConfig(), 'requiredStaff', {
            weekday: { dayShift: 3, nightShift: 3 },
            weekend: { nightShift: 3 }
        });
    }
    
    /**
     * シフト時間を取得
     * @param {string} shiftType
     * @returns {number}
     */
    function getShiftHours(shiftType) {
        const shiftHours = safeGet(getConfig(), 'shiftHours', {});
        return shiftHours[shiftType] !== undefined ? shiftHours[shiftType] : 0;
    }
    
    /**
     * 日付セルを取得
     * @param {string} staffName
     * @param {string} date
     * @returns {Element|null}
     */
    function getDateCell(staffName, date) {
        const staffRow = getElement(`.staff-row[data-staff="${staffName}"]`, true);
        if (staffRow) {
            return staffRow.querySelector(`.date-cell[data-date="${date}"]`);
        }
        return null;
    }
    
    /**
     * スタッフの現在のシフトを取得
     * @param {string} staffName
     * @param {string} date
     * @returns {string|null}
     */
    function getStaffShift(staffName, date) {
        const cell = getDateCell(staffName, date);
        if (!cell) return null;
        
        const shiftContent = cell.querySelector('.shift-content');
        return shiftContent ? shiftContent.dataset.shift : null;
    }
    
    /**
     * 土日かどうか判定
     * @param {Object} dateInfo - { weekday_jp: '土' | '日' | ... }
     * @returns {boolean}
     */
    function isWeekend(dateInfo) {
        if (!dateInfo) return false;
        return dateInfo.weekday_jp === '土' || dateInfo.weekday_jp === '日';
    }
    
    /**
     * 除外スタッフを取得
     * @param {string[]} staffList
     * @returns {string[]}
     */
    function getExcludedStaff(staffList) {
        const excluded = [];
        if (!staffList) return excluded;
        
        staffList.forEach(staff => {
            const checkbox = document.getElementById(`staff-exclude-${staff}`);
            if (checkbox && checkbox.checked) {
                excluded.push(staff);
            }
        });
        return excluded;
    }
    
    /**
     * 日勤専門スタッフを取得
     * @param {string[]} staffList
     * @param {string[]} excludedStaff
     * @returns {string[]}
     */
    function getDayShiftOnlyStaff(staffList, excludedStaff = []) {
        const dayShiftOnlyCount = safeGet(getConfig(), 'staff.dayShiftOnlyCount', 3);
        const result = [];
        
        for (let i = 0; i < Math.min(dayShiftOnlyCount, staffList.length); i++) {
            const checkbox = document.getElementById(`day-shift-only-${i + 1}`);
            if (checkbox && checkbox.checked && !excludedStaff.includes(staffList[i])) {
                result.push(staffList[i]);
            }
        }
        return result;
    }
    
    /**
     * 24時間シフトスタッフを取得
     * @param {string[]} staffList
     * @param {string[]} dayShiftOnlyStaff
     * @param {string[]} excludedStaff
     * @returns {string[]}
     */
    function getShiftStaff(staffList, dayShiftOnlyStaff, excludedStaff = []) {
        return staffList.filter(staff => 
            !dayShiftOnlyStaff.includes(staff) && !excludedStaff.includes(staff)
        );
    }
    
    /**
     * スタッフの労働時間を計算
     * @param {string} staffName
     * @param {Object} schedule - {staffName: {date: shiftType}}
     * @param {Array} dates
     * @param {number} dateIndex - この日付までの労働時間を計算（指定しない場合は全期間）
     * @returns {number}
     */
    function calculateStaffHours(staffName, schedule, dates, dateIndex = null) {
        if (!dates) return 0;
        
        let totalHours = 0;
        const endIndex = dateIndex !== null ? dateIndex : dates.length;
        
        for (let i = 0; i < endIndex; i++) {
            const date = dates[i].date;
            const shiftType = schedule?.[staffName]?.[date];
            if (shiftType) {
                totalHours += getShiftHours(shiftType);
            }
        }
        
        return totalHours;
    }
    
    /**
     * 連続24勤パターンをカウント
     * @param {Object} schedule
     * @param {string} staff
     * @param {Array} dates
     * @param {number} dateIndex
     * @returns {number}
     */
    function countConsecutive24Shifts(schedule, staff, dates, dateIndex) {
        const hour24Shifts = get24HourShifts();
        const morningShift = safeGet(getShiftTypesConfig(), 'morningShift', '明');
        
        let count = 0;
        let checkIndex = dateIndex - 1;
        
        while (checkIndex >= 1) {
            const prevDate = dates[checkIndex].date;
            const prevPrevDate = dates[checkIndex - 1].date;
            const prevShift = schedule[staff]?.[prevDate];
            const prevPrevShift = schedule[staff]?.[prevPrevDate];
            
            if (prevShift === morningShift && hour24Shifts.includes(prevPrevShift)) {
                count++;
                checkIndex -= 2;
            } else {
                break;
            }
        }
        
        return count;
    }
    
    /**
     * デバウンス関数
     * @param {Function} func
     * @param {number} wait
     * @returns {Function}
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    // 公開API
    return {
        // DOM操作
        getElement,
        getElements,
        clearDomCache,
        getDateCell,
        
        // 安全なアクセス
        safeGet,
        
        // 設定取得
        getConfig,
        getShiftTypesConfig,
        get24HourShifts,
        is24HourShift,
        getConstraints,
        getPenalties,
        getRequiredStaff,
        getShiftHours,
        
        // スタッフ関連
        getStaffShift,
        getExcludedStaff,
        getDayShiftOnlyStaff,
        getShiftStaff,
        calculateStaffHours,
        
        // 日付関連
        isWeekend,
        
        // シフト計算
        countConsecutive24Shifts,
        
        // ユーティリティ
        debounce
    };
})();


