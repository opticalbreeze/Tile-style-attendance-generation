from flask import Flask, render_template, jsonify
from datetime import datetime, timedelta
import json
import os
from calendar import monthrange

app = Flask(__name__)

def load_config():
    """設定ファイルを読み込む"""
    config_path = os.path.join(os.path.dirname(__file__), 'config.json')
    
    # デフォルト設定
    default_config = {
        "staff": {
            "list": [],
            "dayShiftOnlyCount": 3
        },
        "shiftHours": {
            "日勤": 8, "24A": 16, "24B": 16, "夜勤": 16,
            "有休": 8, "明": 0, "休": 0
        },
        "requiredStaff": {
            "weekday": {"dayShift": 3, "nightShift": 3},
            "weekend": {"nightShift": 3}
        },
        "penalties": {
            "continuousShift": 1000,
            "hoursDifferenceMultiplier": 100,
            "samePairPenalty": 100000
        },
        "constraints": {
            "maxConsecutive24Shifts": 2,
            "preventSamePair": True
        },
        "shiftTypes": {
            "24HourShifts": ["24A", "24B", "夜勤"],
            "dayShift": "日勤",
            "morningShift": "明",
            "rest": "休",
            "paidLeave": "有休"
        }
    }
    
    try:
        if not os.path.exists(config_path):
            print(f"警告: 設定ファイルが見つかりません: {config_path}")
            print("デフォルト設定を使用します。")
            return default_config
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
            
        # デフォルト設定とマージ（読み込んだ設定を優先）
        for key, value in default_config.items():
            if key not in config:
                config[key] = value
            elif isinstance(value, dict) and isinstance(config[key], dict):
                for sub_key, sub_value in value.items():
                    if sub_key not in config[key]:
                        config[key][sub_key] = sub_value
        
        return config
        
    except json.JSONDecodeError as e:
        print(f"エラー: 設定ファイルのJSON形式が不正です: {e}")
        return default_config
    except Exception as e:
        print(f"エラー: 設定ファイルの読み込みに失敗しました: {e}")
        return default_config

def get_payroll_period():
    """給料計算月度の前月16日から当月15日までの期間を取得"""
    today = datetime.now()
    current_year = today.year
    current_month = today.month
    
    # 当月の15日を基準に期間を計算
    if today.day <= 15:
        # 15日以前なら、前月16日～当月15日
        if current_month == 1:
            start_date = datetime(current_year - 1, 12, 16)
            end_date = datetime(current_year, 1, 15)
            display_month = current_month
            display_year = current_year
        else:
            start_date = datetime(current_year, current_month - 1, 16)
            end_date = datetime(current_year, current_month, 15)
            display_month = current_month
            display_year = current_year
    else:
        # 16日以降なら、当月16日～翌月15日
        if current_month == 12:
            start_date = datetime(current_year, 12, 16)
            end_date = datetime(current_year + 1, 1, 15)
            display_month = 1
            display_year = current_year + 1
        else:
            start_date = datetime(current_year, current_month, 16)
            end_date = datetime(current_year, current_month + 1, 15)
            display_month = current_month + 1
            display_year = current_year
    
    # 期間内の全日期を生成
    dates = []
    current = start_date
    while current <= end_date:
        dates.append({
            'date': current.strftime('%Y-%m-%d'),
            'day': current.day,
            'weekday': current.strftime('%a'),
            'weekday_jp': get_weekday_jp(current.weekday())
        })
        current += timedelta(days=1)
    
    return {
        'start_date': start_date.strftime('%Y-%m-%d'),
        'end_date': end_date.strftime('%Y-%m-%d'),
        'display_month': display_month,
        'display_year': display_year,
        'dates': dates
    }

def get_weekday_jp(weekday):
    """曜日を日本語に変換"""
    weekdays = ['月', '火', '水', '木', '金', '土', '日']
    return weekdays[weekday]

@app.route('/')
def index():
    period = get_payroll_period()
    config = load_config()
    return render_template('index.html', period=period, config=config)

@app.route('/api/period')
def api_period():
    """期間情報をJSONで返す"""
    period = get_payroll_period()
    return jsonify(period)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)

