with open(r'C:\vantro-mobile\app\login.tsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    'PIN set by your manager when your account was created',
    'Set your PIN when you first log in'
)
with open(r'C:\vantro-mobile\app\login.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
