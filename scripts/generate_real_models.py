#!/usr/bin/env python3
"""
scripts/generate_real_models.py
Generates fixed per-token label tables (vocab-*.json) for the on-device JS classifier.
Weights are deterministic (numpy seed 42) with forced labels — not trained.
"""

import json
import os
import numpy as np

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'models'))
os.makedirs(OUTPUT_DIR, exist_ok=True)

LANGUAGES = {
    'en': {
        'clean_words': [
            'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it',
            'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
            'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
            'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
            'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
            'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know',
            'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
            'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come',
            'its', 'apple', 'banana', 'orange', 'friend', 'house', 'day', 'work',
            'book', 'water', 'life', 'hand', 'part', 'child', 'eye', 'woman', 'place',
            'case', 'point', 'government', 'company', 'number', 'group', 'problem'
        ],
        'spell_errors': {
            'teh': 'the',
            'recieved': 'received',
            'seperate': 'separate',
            'definately': 'definitely',
            'untill': 'until',
            'occured': 'occurred',
            'accomodate': 'accommodate',
            'wierd': 'weird',
            'goverment': 'government',
            'tommorow': 'tomorrow',
            'truely': 'truly',
            'beleive': 'believe',
            'calender': 'calendar',
            'succesful': 'successful',
            'neccessary': 'necessary',
            'embarass': 'embarrass',
            'refered': 'referred',
            'aquaintance': 'acquaintance',
            'agressive': 'aggressive',
            'allmost': 'almost',
            'alot': 'a lot',
            'basicly': 'basically',
            'concious': 'conscious',
            'disapear': 'disappear',
            'existance': 'existence',
            'farenheit': 'fahrenheit',
            'fourty': 'forty',
            'guarentee': 'guarantee',
            'harrass': 'harass',
            'independant': 'independent',
            'mispell': 'misspell',
            'noticable': 'noticeable',
            'occurence': 'occurrence',
            'peice': 'piece',
            'priviledge': 'privilege',
            'publically': 'publicly',
            'realy': 'really',
            'religous': 'religious',
            'remeber': 'remember',
            'resistence': 'resistance',
            'sence': 'sense',
            'succes': 'success',
            'suprise': 'surprise',
            'tendancy': 'tendency',
            'tomorow': 'tomorrow',
            'tounge': 'tongue',
            'unfortunatly': 'unfortunately',
            'untill': 'until',
            'usally': 'usually',
            'wierd': 'weird',
            'writting': 'writing'
        },
        'grammar_errors': {
            'dont': "don't",
            'doesnt': "doesn't",
            'isnt': "isn't",
            'arent': "aren't",
            'hasnt': "hasn't",
            'havent': "haven't",
            'wont': "won't",
            'cant': "can't",
            'couldnt': "couldn't",
            'shouldnt': "shouldn't",
            'wouldnt': "wouldn't"
        }
    },
    'it': {
        'clean_words': [
            'il', 'la', 'di', 'e', 'che', 'un', 'in', 'a', 'per', 'una', 'sono',
            'mi', 'si', 'ho', 'ma', 'ha', 'non', 'da', 'ci', 'lo', 'le', 'ti',
            'con', 'se', 'come', 'io', 'cosa', 'questo', 'lei', 'lui', 'della',
            'del', 'nel', 'tutto', 'più', 'mio', 'ancora', 'bene', 'sei', 'chi',
            'era', 'sul', 'sulla', 'ogni', 'anche', 'molto', 'dove', 'perché',
            'fatto', 'quando', 'ora', 'senza', 'dopo', 'grazie', 'ciao', 'sempre',
            'prima', 'questa', 'loro', 'stato', 'stata', 'fare', 'tempo', 'anno',
            'giorno', 'uomo', 'donna', 'vita', 'occhio', 'casa', 'parte', 'mondo',
            'amico', 'amica', 'lavoro', 'mano', 'notte', 'strada', 'città', 'parola'
        ],
        'spell_errors': {
            'propio': 'proprio',
            'aereoplano': 'aeroplano',
            'accellerare': 'accelerare',
            'sopratutto': 'soprattutto',
            'colluttazione': 'colluttazione',
            'conoscienza': 'conoscenza',
            'ingegnere': 'ingegnere',
            'ingenioso': 'ingegnoso',
            'famigliari': 'familiari',
            'eccezzionale': 'eccezionale',
            'qualcosa': 'qualcosa',
            'obbiettivo': 'obiettivo',
            'provvisorio': 'provvisorio',
            'sufficente': 'sufficiente',
            'efficente': 'efficiente',
            'daccordo': "d'accordo",
            'altranno': "l'altr'anno",
            'qualchevolta': 'qualche volta',
            'pressapoco': 'pressappoco',
            'innanzitutto': 'innanzitutto',
            'soprattuto': 'soprattutto',
            'tuttoggi': 'tuttora'
        },
        'grammar_errors': {
            'perche': 'perché',
            'poiche': 'poiché',
            'affinche': 'affinché',
            'benche': 'benché',
            'nonche': 'nonché',
            'puo': 'può',
            'gia': 'già',
            'piu': 'più',
            'cioe': 'cioè',
            'pero': 'però'
        }
    },
    'sl': {
        'clean_words': [
            'in', 'je', 'da', 'se', 'na', 'ne', 'za', 'ki', 'pa', 'bi', 'so',
            'kot', 'bo', 'tudi', 'ali', 'z', 'pri', 'po', 'lahko', 'že', 'le',
            'tako', 'do', 'sem', 'ga', 'od', 'te', 'kar', 'med', 'ti', 'jaz',
            'ko', 'ker', 'kaj', 'bila', 'bil', 'si', 'tem', 'zelo', 'kako',
            'več', 'samo', 'še', 'kjer', 'prišel', 'glede', 'zaradi', 'vsak',
            'vendar', 'pred', 'čeprav', 'nam', 'vam', 'bomo', 'boste', 'toda',
            'lep', 'dan', 'hvala', 'življenje', 'ampak', 'človek', 'leto',
            'čas', 'delo', 'otrok', 'roka', 'mesto', 'hiša', 'beseda', 'stran',
            'voda', 'oče', 'mati', 'prijatelj', 'kmet', 'zemlja', 'pot', 'svet'
        ],
        'spell_errors': {
            'vredu': 'v redu',
            'navsezadnje': 'na vse zadnje',
            'kdor koli': 'kdorkoli',
            'kakor koli': 'kakorkoli',
            'zarad': 'zaradi',
            'bomo vidli': 'bomo videli',
            'bov': 'bo',
            'zvedel': 'izvedel',
            'odstopit': 'odstopiti',
            'narejen': 'narejen',
            'lahko bi': 'lahko bi',
            'hvala lepa': 'hvala lepa',
            'dolgocasen': 'dolgočasen',
            'napacen': 'napačen',
            'popolnoma': 'popolnoma',
            'najprej': 'najprej',
            'vendarle': 'vendarle',
            'skoz': 'skozi',
            'tut': 'tudi',
            'zdej': 'zdaj',
            'dons': 'danes',
            'nc': 'nič',
            'vedno': 'vedno'
        },
        'grammar_errors': {
            'nebomo': 'ne bomo',
            'nemorem': 'ne morem',
            'nebi': 'ne bi',
            'nebom': 'ne bom',
            'nebodo': 'ne bodo',
            'neželimo': 'ne želimo'
        }
    }
}

def build_model_for_lang(lang_code, lang_data):
    # Build unified token dictionary
    vocab = {'<pad>': 0, '<unk>': 1}
    token_labels = {0: 0, 1: 0} # mapping token_id -> ground truth class
    # Classes: 0: OK, 1: SPELL, 2: GRAMMAR, 3: PREP, 4: PUNCT

    # Add clean words
    for w in lang_data['clean_words']:
        w = w.lower().strip()
        if w not in vocab:
            tid = len(vocab)
            vocab[w] = tid
            token_labels[tid] = 0

    # Add spelling errors
    for w in lang_data['spell_errors'].keys():
        w = w.lower().strip()
        if w not in vocab:
            tid = len(vocab)
            vocab[w] = tid
            token_labels[tid] = 1

    # Add grammar errors
    for w in lang_data['grammar_errors'].keys():
        w = w.lower().strip()
        if w not in vocab:
            tid = len(vocab)
            vocab[w] = tid
            token_labels[tid] = 2

    vocab_size = len(vocab)
    hidden_dim = 32
    num_classes = 5

    # Deterministic random weights (seed 42) with forced labels — not trained
    np.random.seed(42)
    # Embedding table E: [vocab_size, hidden_dim]
    E = np.random.randn(vocab_size, hidden_dim).astype(np.float32) * 0.05

    # Layer 1: [hidden_dim, 64]
    W1 = np.random.randn(hidden_dim, 64).astype(np.float32) * 0.1
    B1 = np.zeros(64, dtype=np.float32)

    # Layer 2: [64, num_classes]
    W2 = np.random.randn(64, num_classes).astype(np.float32) * 0.1
    B2 = np.zeros(num_classes, dtype=np.float32)

    # Project embeddings so the JS forward pass aligns with token_labels
    pseudo_inv_W = np.linalg.pinv(W1 @ W2)  # [num_classes, hidden_dim]
    for tid, label in token_labels.items():
        target_logit = np.zeros(num_classes, dtype=np.float32)
        target_logit[label] = 5.0  # High positive activation for target label
        for other in range(num_classes):
            if other != label:
                target_logit[other] = -2.0
        E[tid] = target_logit @ pseudo_inv_W

    vocab_json_path = os.path.join(OUTPUT_DIR, f'vocab-{lang_code}.json')
    vocab_data = {
        'language': lang_code,
        'version': '1.0.1',
        'architecture': 'Gather -> Linear(32, 64) -> ReLU -> Linear(64, 5)',
        'note': 'Fixed per-token label table; weights generated with seed 42 + forced labels (not trained)',
        'classes': ['OK', 'SPELL', 'GRAMMAR', 'PREP', 'PUNCT'],
        'vocab_size': vocab_size,
        'vocab': vocab,
        'corrections': {**lang_data['spell_errors'], **lang_data['grammar_errors']},
        'weights': {
            'E': E.tolist(),
            'W1': W1.tolist(),
            'B1': B1.tolist(),
            'W2': W2.tolist(),
            'B2': B2.tolist()
        }
    }
    with open(vocab_json_path, 'w', encoding='utf-8') as f:
        json.dump(vocab_data, f, ensure_ascii=False, indent=2)
    print(f"Generated vocab label table: {vocab_json_path} ({os.path.getsize(vocab_json_path)} bytes)")

if __name__ == '__main__':
    for lang in ['en', 'it', 'sl']:
        build_model_for_lang(lang, LANGUAGES[lang])
    print("All vocab label tables successfully generated!")
