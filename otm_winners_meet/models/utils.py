import re
from difflib import SequenceMatcher


def normalize_phone(raw, country_code='91'):
    """Return digits with country code (11-15 digits) or '' when invalid."""
    digits = re.sub(r'\D', '', raw or '')
    if digits.startswith('00'):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith('0'):
        digits = digits[1:]
    if len(digits) == 10:
        digits = (country_code or '91') + digits
    return digits if 11 <= len(digits) <= 15 else ''


def _tokens(name):
    return [t for t in re.sub(r'[^a-z0-9 ]', ' ', (name or '').lower()).split() if t]


def name_score(a, b):
    """Similarity 0..1 between two person names (tolerates initials / order / typos)."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    ratio = SequenceMatcher(None, ' '.join(sorted(ta)), ' '.join(sorted(tb))).ratio()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    if all(any(l.startswith(s) or s.startswith(l) for l in long_) for s in short):
        ratio = max(ratio, 0.9)
    return ratio
