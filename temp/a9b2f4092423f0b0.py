def is_palindrome(sentence):
    cleaned = ''.join(c.lower() for c in sentence if c.isalnum())
    return cleaned == cleaned[::-1]

sentence = input("Enter a sentence: ")
if is_palindrome(sentence):
    print("Palindrome")
else:
    print("Not a palindrome")
