import os
import random
import string
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['UPLOAD_FOLDER'] = 'static/uploads'

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

socketio = SocketIO(app, cors_allowed_origins="*")

# State management
games = {} # pin -> { host_sid, questions: [], players: { sid: { name, score, answers: {} } }, current_question_index: -1, state: 'waiting' }
player_game_map = {} # sid -> pin

def generate_pin():
    return ''.join(random.choices(string.digits, k=6))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create')
def create():
    return render_template('create.html')

@app.route('/host')
def host():
    return render_template('host.html')

@app.route('/player')
def player():
    return render_template('player.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if file:
        filename = secure_filename(file.filename)
        # add a random prefix to avoid collisions
        prefix = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        unique_filename = f"{prefix}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        file.save(filepath)
        return jsonify({'url': f'/static/uploads/{unique_filename}'})

@socketio.on('create_game')
def on_create_game(data):
    questions = data.get('questions', [])
    pin = generate_pin()
    while pin in games:
        pin = generate_pin()
        
    games[pin] = {
        'host_sid': request.sid,
        'questions': questions,
        'players': {},
        'current_question_index': -1,
        'state': 'waiting'
    }
    join_room(pin)
    emit('game_created', {'pin': pin})

@socketio.on('join_game')
def on_join_game(data):
    pin = data.get('pin')
    name = data.get('name')
    
    if pin not in games:
        emit('join_error', {'message': 'رمز الدخول غير صحيح'})
        return
    
    if games[pin]['state'] != 'waiting':
        emit('join_error', {'message': 'اللعبة قد بدأت بالفعل'})
        return
        
    # Check name duplicate
    for sid, p in games[pin]['players'].items():
        if p['name'] == name:
            emit('join_error', {'message': 'الاسم مستخدم بالفعل'})
            return

    games[pin]['players'][request.sid] = {
        'name': name,
        'score': 0,
        'answers': {} # q_index -> { correct, time_taken }
    }
    player_game_map[request.sid] = pin
    join_room(pin)
    
    emit('join_success', {'pin': pin, 'name': name})
    # notify host
    emit('player_joined', {'name': name}, room=games[pin]['host_sid'])

@socketio.on('start_game')
def on_start_game(data):
    pin = data.get('pin')
    if pin in games and games[pin]['host_sid'] == request.sid:
        games[pin]['state'] = 'playing'
        emit('game_started', {}, room=pin)

@socketio.on('next_question')
def on_next_question(data):
    pin = data.get('pin')
    if pin in games and games[pin]['host_sid'] == request.sid:
        game = games[pin]
        game['current_question_index'] += 1
        index = game['current_question_index']
        
        if index < len(game['questions']):
            q = game['questions'][index]
            # Send question to host
            emit('new_question_host', {'question': q, 'index': index, 'total': len(game['questions'])}, room=game['host_sid'])
            # Send signal to players
            emit('new_question_player', {'index': index}, room=pin, skip_sid=game['host_sid'])
        else:
            # End game
            leaderboard = get_leaderboard(pin)
            emit('game_over', {'leaderboard': leaderboard}, room=pin)

@socketio.on('submit_answer')
def on_submit_answer(data):
    pin = player_game_map.get(request.sid)
    if not pin or pin not in games:
        return
        
    game = games[pin]
    if game['state'] != 'playing':
        return
        
    index = game['current_question_index']
    answer_idx = data.get('answer_idx')
    time_left = data.get('time_left', 0) # e.g. 5.0 to 0.0
    
    # Calculate score
    correct_idx = game['questions'][index].get('correct_idx', 0)
    is_correct = (answer_idx == correct_idx)
    
    score_earned = 0
    if is_correct:
        # Max 1000 points, minimum 500 points for a correct answer
        # The faster they answer, the higher the score
        time_taken = 5.0 - time_left
        if time_taken < 0: time_taken = 0
        if time_taken > 5.0: time_taken = 5.0
        score_earned = int(1000 * (1 - (time_taken / 5.0) / 2))
        
    game['players'][request.sid]['score'] += score_earned
    game['players'][request.sid]['answers'][index] = {
        'correct': is_correct,
        'earned': score_earned
    }
    
    # Send feedback to player immediately
    emit('answer_result', {'correct': is_correct, 'score': game['players'][request.sid]['score']})
    
    # notify host that someone answered
    emit('player_answered', {'total_answered': len([p for p in game['players'].values() if index in p['answers']]) }, room=game['host_sid'])

@socketio.on('show_question_results')
def on_show_question_results(data):
    pin = data.get('pin')
    if pin in games and games[pin]['host_sid'] == request.sid:
        index = games[pin]['current_question_index']
        leaderboard = get_leaderboard(pin)
        emit('question_results_host', {'leaderboard': leaderboard[:5]}, room=games[pin]['host_sid'])

@socketio.on('kick_player')
def on_kick_player(data):
    pin = data.get('pin')
    name = data.get('name')
    if pin in games and games[pin]['host_sid'] == request.sid:
        target_sid = None
        for sid, p in games[pin]['players'].items():
            if p['name'] == name:
                target_sid = sid
                break
        if target_sid:
            del games[pin]['players'][target_sid]
            if target_sid in player_game_map:
                del player_game_map[target_sid]
            emit('you_kicked', {}, room=target_sid)
            leave_room(pin, sid=target_sid)

def get_leaderboard(pin):
    players = games[pin]['players'].values()
    sorted_players = sorted(players, key=lambda x: x['score'], reverse=True)
    return [{'name': p['name'], 'score': p['score']} for p in sorted_players]

@socketio.on('disconnect')
def test_disconnect():
    pin = player_game_map.get(request.sid)
    if pin and pin in games:
        name = games[pin]['players'][request.sid]['name']
        # Don't delete player from game to preserve score if they disconnect, 
        # but you might want to notify host
        # del games[pin]['players'][request.sid]
        # del player_game_map[request.sid]
        pass

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)
