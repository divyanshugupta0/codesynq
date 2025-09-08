import java.util.Scanner;
public class subsequence81ec016440b32b08{
    boolean isSubSeq(String str, String seq){
        int j = 0;
        for (int i = 0; i < str.length() && j < seq.length(); i++) {
            if (str.charAt(i) == seq.charAt(j)) {
                j++;
            }
        }
        return j == seq.length();
    }
    public static void main(String[] args) {
        subsequence sub = new subsequence();
        Scanner sc = new Scanner(System.in);
        System.out.println("Enter the main string:");
        String str = sc.nextLine();
        System.out.println("Enter the subsequence:");
        String seq = sc.nextLine();
        System.out.println("Is subsequence: " + sub.isSubSeq(str, seq));
    }
}