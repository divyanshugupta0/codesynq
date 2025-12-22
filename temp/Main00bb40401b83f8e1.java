import java.util.*;

public class Main00bb40401b83f8e1 {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);

        String sentence = "";
        
        // Prevent NoSuchElementException
        if (sc.hasNextLine()) {
            sentence = sc.nextLine();
        } else {
            sentence = "";  // default blank input
        }

        String[] words = sentence.toLowerCase().split("\\s+");

        HashMap<String, Integer> map = new HashMap<>();

        for (String word : words) {
            if(!word.isEmpty())
                map.put(word, map.getOrDefault(word, 0) + 1);
        }

        int repeatedCount = 0;
        for (int count : map.values()) {
            if (count > 1) {
                repeatedCount++;
            }
        }

        System.out.println(repeatedCount);
    }
}
