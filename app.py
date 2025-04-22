from flask import Flask, render_template, request, jsonify
import os

app = Flask(__name__)

def load_accounts():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(BASE_DIR, 'accounts.txt')
    accounts = []

    # 커스텀 캐릭터 정렬 순서
    priority_list = [
        '수시노', '미카', '수나코', '드히나', '임시노', '쿠로코', '키사키', '아코', '히마리', '뉴요코', '캠하레', '와카모',
        '운유카', '뉴우카', '이로하', '체리노', '슌', '우이', '코코나', '수로코', '드아루', '뉴츠키', '수즈나', '수우이',
        '마코토', '드아코', '나기사', '아마리', '온도카', '코하루', '이오리', '히비키', '메리스', '수야코', '수사키',
        '수즈사', '운마리', '뉴루나', '뉴아루', '수나타'
    ]
    priority = {name: idx for idx, name in enumerate(priority_list)}

    with open(file_path, 'r', encoding='utf-8') as file:
        for line in file:
            parts = line.strip().split(',')
            if len(parts) < 3:  # 가격, 계정번호, 캐릭터 최소 3개가 있어야 함
                continue  # 이 줄은 무시

            price = parts[0]       # 가격
            account_num = parts[1] # 계정번호
            chars = parts[2:]      # 캐릭터 리스트
            chars.sort(key=lambda x: priority.get(x, 999))
            accounts.append({'price': price, 'num': account_num, 'chars': chars})
    return accounts


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/search', methods=['POST'])
def search():
    data = request.json
    selected_chars = set(data['characters'])
    min_price = float(data.get('min_price', 1))
    max_price = float(data.get('max_price', 99))

    accounts = load_accounts()

    matching_accounts = []

    for acc in accounts:
        acc_price = float(acc['price'])  # 가격도 숫자로 확실히 변환
        
        # 캐릭터 조건과 가격 조건 둘 다 만족하는지 체크
        if selected_chars.issubset(set(acc['chars'])) and (min_price <= acc_price <= max_price):
            matching_accounts.append(acc)

    return jsonify(matching_accounts)


if __name__ == '__main__':
    app.run(debug=True)
