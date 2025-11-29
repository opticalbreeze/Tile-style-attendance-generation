// 制約設定UIモジュール

window.ConstraintsUI = (function() {
    
    // 制約設定UIを初期化
    function initializeConstraintsUI() {
        const config = window.appData?.config || {};
        const constraints = config.constraints || {};
        const penalties = config.penalties || {};
        
        // 連続24勤の上限
        const maxConsecutiveSelect = document.getElementById('max-consecutive');
        if (maxConsecutiveSelect) {
            const maxConsecutive = constraints.maxConsecutive24Shifts || 2;
            maxConsecutiveSelect.value = maxConsecutive.toString();
        }
        
        // ペア連続防止
        const preventSamePairCheckbox = document.getElementById('prevent-same-pair');
        if (preventSamePairCheckbox) {
            preventSamePairCheckbox.checked = constraints.preventSamePair !== false;
        }
        
        // ペア防止ペナルティ強度
        const samePairPenaltySelect = document.getElementById('same-pair-penalty');
        if (samePairPenaltySelect) {
            const penalty = penalties.samePairPenalty || 100000;
            const options = Array.from(samePairPenaltySelect.options);
            let closestOption = options[0];
            let closestDiff = Math.abs(parseInt(closestOption.value) - penalty);
            options.forEach(opt => {
                const diff = Math.abs(parseInt(opt.value) - penalty);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestOption = opt;
                }
            });
            samePairPenaltySelect.value = closestOption.value;
        }
        
        // 時間均等化ペナルティ
        const hoursBalancePenaltySelect = document.getElementById('hours-balance-penalty');
        if (hoursBalancePenaltySelect) {
            const penalty = penalties.hoursDifferenceMultiplier || 100;
            const options = Array.from(hoursBalancePenaltySelect.options);
            let closestOption = options[0];
            let closestDiff = Math.abs(parseInt(closestOption.value) - penalty);
            options.forEach(opt => {
                const diff = Math.abs(parseInt(opt.value) - penalty);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestOption = opt;
                }
            });
            hoursBalancePenaltySelect.value = closestOption.value;
        }
        
        // 設定適用ボタン
        const applyBtn = document.getElementById('apply-constraints-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', applyConstraintsSettings);
        }
    }

    // 制約設定を適用
    function applyConstraintsSettings() {
        const maxConsecutiveSelect = document.getElementById('max-consecutive');
        const preventSamePairCheckbox = document.getElementById('prevent-same-pair');
        const samePairPenaltySelect = document.getElementById('same-pair-penalty');
        const hoursBalancePenaltySelect = document.getElementById('hours-balance-penalty');
        
        if (!window.appData.config.constraints) {
            window.appData.config.constraints = {};
        }
        if (!window.appData.config.penalties) {
            window.appData.config.penalties = {};
        }
        
        if (maxConsecutiveSelect) {
            window.appData.config.constraints.maxConsecutive24Shifts = parseInt(maxConsecutiveSelect.value);
        }
        if (preventSamePairCheckbox) {
            window.appData.config.constraints.preventSamePair = preventSamePairCheckbox.checked;
        }
        if (samePairPenaltySelect) {
            window.appData.config.penalties.samePairPenalty = parseInt(samePairPenaltySelect.value);
        }
        if (hoursBalancePenaltySelect) {
            window.appData.config.penalties.hoursDifferenceMultiplier = parseInt(hoursBalancePenaltySelect.value);
        }
        
        console.log('[制約設定] 適用:', {
            maxConsecutive24Shifts: window.appData.config.constraints.maxConsecutive24Shifts,
            preventSamePair: window.appData.config.constraints.preventSamePair,
            samePairPenalty: window.appData.config.penalties.samePairPenalty,
            hoursDifferenceMultiplier: window.appData.config.penalties.hoursDifferenceMultiplier
        });
        
        alert('制約設定を適用しました。\n自動アテンドを実行すると、新しい設定が反映されます。');
    }

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

    // 公開API
    return {
        initializeConstraintsUI: initializeConstraintsUI,
        applyConstraintsSettings: applyConstraintsSettings,
        initializeDayShiftOnlyCheckboxes: initializeDayShiftOnlyCheckboxes
    };
})();

