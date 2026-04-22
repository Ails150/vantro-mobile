content = open('app/login.tsx', encoding='utf-8').read()
# Find the line with handleForgotPin and wrap both TouchableOpacity elements
import re
# Replace the two adjacent TouchableOpacity elements with a fragment wrapper
pattern = r'(\s+<TouchableOpacity onPress=\{[^}]+setShowEmailEntry[^<]+</TouchableOpacity>)\s*\n(\s+<TouchableOpacity onPress=\{handleForgotPin\}[^<]+</TouchableOpacity>)'
replacement = r'          <>\1\n\2\n          </>'
result = re.sub(pattern, replacement, content, flags=re.DOTALL)
open('app/login.tsx', 'w', encoding='utf-8').write(result)
print('Fixed:', 'handleForgotPin' in result and '<>' in result)