// Welcome to CodeSynq!
// Java - Object-Oriented Programming Language
// Press Ctrl+Space for suggestions

import java.util.*;
public class Main11ed94bfa8be7e02 {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println("Hello");
        int a = sc.nextInt();
        
        // Example: Variables and Methods
        String greeting = "Welcome to CodeSynq-Java!";
        showMessage(greeting);
        
        // Example: Simple calculation
        int result = addNumbers(5, 3);
        System.out.println("5 + 3 = " + result);
    }
    
    public static void showMessage(String msg) {
        System.out.println(msg);
    }
    
    public static int addNumbers(int a, int b) {
        return a + b;
    }
}