public class singlylinkedlist2406fe8d7de8d77d {
    private Listnode head;//implmentation of Listnode(head)
    private static class Listnode{
        private int data;//instance variable
        private Listnode next;
        public Listnode(int data){//Constructor method
            this.data=data;
            this.next=null;
        }
    }
        public void display(){
            Listnode current = head;
            while(current!=null){
                System.out.print(current.data + " --> ");
                current=current.next;
            }
            System.out.println("null");
        }
        public int length(){
            int count = 0;
            Listnode current = head;
            if(head==null) return 0;
            while(current != null){
                count++;
                current = current.next;
            }
            return count;
        }
        public void insertFirst(int value){//logically working as Stack.
            Listnode newNode = new Listnode(value);
            newNode.next=head;
            head = newNode;
        }
        public void insertLast(int value){
            Listnode newNode = new Listnode(value);
            if(head==null){
                head=newNode;
                return;//it flushes left unused variables.
            }
            Listnode current = head;
            while(current.next!=null){
                current=current.next;
            }
            current.next=newNode;//logically working as Queue.
        }
        public Listnode deleteFirst(){
            if(head == null) return null;
            Listnode temp = head;
            head = head.next;
            temp.next = null;
            return temp;//return flush the temp variable.
        }
        public Listnode deleteLast(){
            if(head==null || head.next== null){
                return head;
            }
            Listnode current = head;
            Listnode previous = null;
            while(current.next != null){
                previous = current;
                current = current.next;
            }
            previous.next = null;
            return current;
        }
        public static void main(String[] args) {
            singlylinkedlist sll = new singlylinkedlist();
            sll.head=new Listnode(10);
            Listnode second=new Listnode(1);
            Listnode third=new Listnode(8);
            Listnode fourth=new Listnode(11);
            sll.head.next=second;
            second.next=third;
            third.next=fourth;
            sll.display();
            System.out.println("Length is: " + sll.length());
            sll.insertFirst(11);
            sll.display();
            System.out.println("Length is: " + sll.length());
            sll.insertLast(12);
            sll.display();
            System.out.println("Length is: " + sll.length());
            sll.deleteFirst();
            sll.display();
            System.out.println("Length is: " + sll.length());
            sll.deleteLast();
            sll.display();
            System.out.println("Length is: " + sll.length());
        }
}