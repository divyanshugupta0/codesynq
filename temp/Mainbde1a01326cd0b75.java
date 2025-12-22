import java.util.*;

public class Mainbde1a01326cd0b75 {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        // Read input sentence
        String sentence = sc.nextLine();

        // Convert to lowercase and split into words
        String[] words = sentence.toLowerCase().split("\\s+");

        // HashMap to store word frequencies
        HashMap<String, Integer> map = new HashMap<>();

        for (String word : words) {
            map.put(word, map.getOrDefault(word, 0) + 1);
        }

        // Count how many words occur more than once
        int repeatedCount = 0;
        for (int count : map.values()) {
            if (count > 1) {
                repeatedCount++;
            }
        }

        // Output the result
        System.out.println(repeatedCount);

        sc.close();
    }
}
