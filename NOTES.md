ve all # Challenge Solving Notes & Patterns

## Last Updated
2026-02-04 19:43

## Critical Patterns Discovered

### 1. Modal Radio Selection - "Please Select an Option"
- **Pattern**: The correct answer is ALWAYS "Option X - Correct Choice"
- **Solution**: Look for text containing "correct choice" (case insensitive)
- **Scroll positions**: 20%, 40%, 60% of modal height
- **Alternative patterns**: "select me", "correct"

### 2. Audio Challenge
- **Pattern**: Challenge asks to "listen" to audio
- **Solution**: NO NEED TO LISTEN - just click next/continue/skip
- **Indicators**: "listen", "audio", "sound", "play"

### 3. Code Input
- **Pattern**: 6-character alphanumeric codes
- **Solution**: Extract with regex `[A-Z0-9]{6}`, type into input
- **Submit**: Click submit button after typing

### 4. Reveal Code Button
- **Pattern**: Button with text "Reveal Code", "Show Code", "Get Code"
- **Solution**: Click button first, then extract code

### 5. Copy/Paste Challenge
- **Pattern**: Requires Ctrl+A, Ctrl+C, Ctrl+V
- **Solution**: Select all, copy, paste into input

### 6. Checkbox Selection
- **Pattern**: Multiple checkboxes to select
- **Solution**: Click all visible checkboxes

### 7. Hover Reveal
- **Pattern**: Content revealed on hover
- **Solution**: Hover over buttons, divs, spans

## Technical Implementation Notes

### Modal Scrolling
- Use `scrollIntoView({ behavior: 'auto', block: 'center' })` for radio buttons
- Scroll to multiple positions: 20%, 40%, 60%
- Use mouse wheel + keyboard (PageDown, End) as backup
- Wait 150ms between scroll positions

### Content Filtering
- Hide: headers, footers, nav, decorations, banners
- Keep: main content, modals, challenge elements
- Use `!important` to override page CSS

### Retry Strategy
- Max 5 attempts per challenge
- 500ms delay between attempts
- Log what was tried in each attempt

## Performance Tips

1. **Don't scroll too far** - 60% max, not 100%
2. **Click labels, not just inputs** - More reliable
3. **Use scrollIntoView** - Ensures element visibility
4. **Dismiss popups first** - Clear the way
5. **Hover before clicking** - Reveals hidden content

## Known Issues

1. Modal scrolling can overshoot - use smaller increments
2. Some radio buttons need label click, not input click
3. Audio challenge doesn't need actual listening

## Success Metrics

- Track which patterns work
- Save to challenge-memory.json
- Update success counts

## Files

- `agent-bruteforce.js` - Main agent
- `challenge-memory.json` - Pattern memory
- `progress-log.txt` - Human-readable log
- `progress.json` - Machine-readable state
- `results-bruteforce.json` - Final results