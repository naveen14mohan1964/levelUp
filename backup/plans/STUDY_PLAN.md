# DSA in 5 Months — Java, Zero → FAANG-ready

**Start:** Mon Oct 5, 2026 · **End:** Sun Mar 7, 2027 · **22 weeks**
**Weekly rhythm:** Mon–Sat = 5h study days · Sunday = self-test + buffer/catch-up
**Phase 1 (Weeks 1–13, Oct 5 → Jan 3):** learn every topic + solve in parallel
**Phase 2 (Weeks 14–22, Jan 4 → Mar 7):** spaced-repetition revision, timed practice, mocks, weak-area focus

---

## 0. How to use this plan

### 0.1 Daily 5-hour split

| Phase | Concept learning | LeetCode practice | Review | Ratio |
|---|---|---|---|---|
| Weeks 1–2 (zero-level ramp-up) | 2h15 | 2h00 | 45m | 45 / 40 / 15 |
| Weeks 3–13 | 1h45 | 2h30 | 45m | 35 / 50 / 15 |
| Weeks 14–22 (revision) | 45m (weak-area repair) | 3h00 (1h spaced repetition + 2h timed) | 1h15 (post-mortems, notes) | 15 / 60 / 25 |

**Weekday timetable (DSA + workout + projects + 7h sleep):**

| Time | Block | Area |
|---|---|---|
| 5:30 | Wake up, drink a glass of water | — |
| 5:35–6:10 | Workout (35 min, see WORKOUT_PLAN.md) | Fitness |
| 6:10–7:55 | **DSA concepts** (videos + notes + writing the template code yourself, while your brain is fresh) | DSA |
| 8:00–9:30 | Breakfast, get ready, commute | — |
| Office hours | **1h project block** (see §7) + a 10-min walk every ~2 hours | Projects / fitness |
| By 7:00 PM | Home, dinner (cooked ahead) | — |
| 7:00–9:30 | **LeetCode block** (2h30; stand up for 2 minutes between problems) | DSA |
| 9:30–10:15 | **Review**: the app's "Due today" spaced-repetition list, then a 3-line note per problem solved today | DSA |
| 10:15–10:30 | Screens off, prepare tomorrow's workout clothes | — |
| **10:30 PM → 5:30 AM** | **Sleep: 7 hours, non-negotiable.** Short sleep raises hunger hormones and stalls fat loss. | Recovery |

- In Weeks 1–2, the extra 30 minutes of concept time goes at the start of the evening block.
- On Saturdays (no office), keep the same blocks but start later. Sleep in until 6:30 if you need to.
- If you're getting less than 6.5 hours of sleep for a week, cut the review block to 15 minutes until you recover. Sleep comes before the review block.

### 0.2 The problem-solving protocol (follow this every time)
1. Read the problem, then write down the inputs, outputs, constraints, and 2 edge cases **before** you start coding.
2. Say the brute-force approach and its complexity out loud, then optimise.
3. **Time box:** Easy 15 min · Medium 30 min · Hard 45 min. If you're stuck at the time limit, read **one hint** and give it 10 more minutes. If you're still stuck, read the solution.
4. If you read the solution, close it and **re-code the problem from scratch**. Mark it `needs revision` with confidence 1–2.
5. Log every problem in the tracker: time taken, number of attempts, a confidence rating from 1 to 5, and a one-line "key insight" note.

### 0.3 Core vs stretch
- Problems marked **★ are stretch problems**. Do them only if you finish the core problems with time left. Otherwise they automatically move to the Phase 2 pool.
- Core problems are non-negotiable. They are what the catch-up rules protect (see §4).

### 0.4 Spaced-repetition rule (the app automates this)
After each solve or re-solve, rate your confidence from 1 to 5. The next review date is set from that rating:

| Confidence | Meaning | Next review in |
|---|---|---|
| 1 | Couldn't solve it / copied the solution | 1 day |
| 2 | Solved it with heavy hints | 3 days |
| 3 | Solved it alone but slowly or with bugs | 7 days |
| 4 | Solved it cleanly within the time box | 14 days |
| 5 | Could teach it, and solved it fast | 30 days |

Each successful re-solve at confidence 4 or higher **doubles** the previous interval. A failed re-solve resets the interval to 1 day. A problem reaching an interval of **60 days or more** counts as "mastered".

### 0.5 Free resources used throughout (Java-friendly)
| Short name | Resource | Best for |
|---|---|---|
| **KK** | Kunal Kushwaha — *Java + DSA Bootcamp* (YouTube) | Zero-level Java, complexity, recursion, LL, trees |
| **Striver** | takeUforward — *A2Z DSA Course/Sheet* (YouTube + site, Java code given) | The main concept track for almost every topic |
| **NC** | NeetCode.io — roadmap + video solutions | Pattern intuition and problem walkthroughs |
| **AV** | Aditya Verma (YouTube) | DP, recursion, sliding window, heap, binary search playlists |
| **AB** | Abdul Bari — Algorithms (YouTube) | Theory: sorting, graphs, shortest paths, MST |
| **WF** | William Fiset (YouTube) | Graph theory, Union-Find, segment tree, Fenwick tree |
| **CPA** | cp-algorithms.com | Advanced topics: KMP, Z-function, segment tree |
| **LC Explore** | LeetCode's free Explore cards (Arrays 101, Linked List, Binary Search, Recursion I, Queue & Stack, Binary Tree) | Structured warm-ups |
| **VisuAlgo** | visualgo.net | Visualising sorting, trees, heaps, graphs |
| **CPH** | *Competitive Programmer's Handbook* (Laaksonen, free PDF) | Concise theory reference |

---

## 1. Phase 1 — Learn (Weeks 1–13)

The problem format is `[Difficulty] Number. Name`, and ★ marks a stretch problem. "GfG" means a GeeksforGeeks practice problem, used where LeetCode's version is Premium-only.

---

### Week 1 · Oct 5–11 · Foundations: Java for DSA, Complexity, Math, Bits, Arrays
**Resources:** KK (Java basics → complexity lectures), Striver A2Z Step 1 (basics, maths, hashing intro), LC Explore *Arrays 101*
**Key concepts:**
- Java toolkit: `int[]`, `ArrayList`, `HashMap`/`HashSet`, `Arrays.sort`/`Arrays.fill`, `Collections`, `StringBuilder`, `Integer.MAX_VALUE`, `long` overflow, and how a `Comparator` lambda works
- Big-O for loops, nested loops, `log n` halving, and recursion (the recursion-tree idea); space complexity; best, average, and worst case
- Maths: digit extraction, GCD (Euclid), primes and the Sieve of Eratosthenes, fast exponentiation
- Bits: `&`, `|`, `^`, `~`, `<<`, `>>`, `>>>`; checking, setting, and clearing a bit; `n & (n-1)`
- Arrays: traversal, in-place modification, reversal, rotation, and the matrix-as-2D-array view

| Day | Concept focus | Problems |
|---|---|---|
| Mon Oct 5 | Java collections for DSA · what Big-O means | [E] 1. Two Sum · [E] 1480. Running Sum of 1d Array · [E] 1672. Richest Customer Wealth · [E] 9. Palindrome Number |
| Tue Oct 6 | Complexity analysis deep dive · basic maths (digits, GCD, primes) | [E] 412. Fizz Buzz · [E] 1979. Find Greatest Common Divisor of Array · [M] 7. Reverse Integer · [M] 204. Count Primes · [M] 50. Pow(x, n) |
| Wed Oct 7 | Array operations: in-place edits, reversal, rotation | [E] 26. Remove Duplicates from Sorted Array · [E] 27. Remove Element · [E] 283. Move Zeroes · [M] 189. Rotate Array · [E★] 1752. Check if Array Is Sorted and Rotated |
| Thu Oct 8 | Counting and XOR tricks on arrays · Boyer–Moore voting | [E] 268. Missing Number · [E] 485. Max Consecutive Ones · [E] 136. Single Number · [E] 169. Majority Element · [E★] 118. Pascal's Triangle |
| Fri Oct 9 | Bit manipulation | [E] 191. Number of 1 Bits · [E] 231. Power of Two · [E] 338. Counting Bits · [E] 190. Reverse Bits · [M★] 137. Single Number II · [M★] 371. Sum of Two Integers |
| Sat Oct 10 | Matrix traversal patterns | [E] 867. Transpose Matrix · [M] 48. Rotate Image · [M] 54. Spiral Matrix · [M] 73. Set Matrix Zeroes |
| **Sun Oct 11** | **Self-test** (90 min, unseen problems): [E] 1342. Number of Steps to Reduce a Number to Zero · [E] 1295. Find Numbers with Even Number of Digits · [M] 59. Spiral Matrix II |

**Milestone:** You can write clean Java with collections, and you can state the time/space complexity of any loop-based code.

---

### Week 2 · Oct 12–18 · Arrays II: Two Pointers, Prefix Sum, Kadane, Intervals
**Resources:** Striver A2Z Step 3 (arrays easy → hard), NC *Two Pointers* + *Arrays & Hashing* videos
**Key concepts:** opposite-end and same-direction pointers · prefix sums plus a HashMap of seen prefixes · Kadane's algorithm (tracking the running max/min) · Dutch National Flag · sort-then-sweep for intervals · next permutation

| Day | Concept focus | Problems |
|---|---|---|
| Mon Oct 12 | Two pointers on sorted data | [E] 977. Squares of a Sorted Array · [E] 88. Merge Sorted Array · [E] 344. Reverse String · [E] 125. Valid Palindrome · [M] 167. Two Sum II - Input Array Is Sorted |
| Tue Oct 13 | Two pointers II: 3Sum family, Dutch flag | [M] 15. 3Sum · [M] 11. Container With Most Water · [M] 75. Sort Colors · [M] 16. 3Sum Closest · [M★] 18. 4Sum |
| Wed Oct 14 | Prefix sums + hashing of prefixes | [E] 303. Range Sum Query - Immutable · [E] 724. Find Pivot Index · [M] 560. Subarray Sum Equals K · [M] 238. Product of Array Except Self · [M★] 974. Subarray Sums Divisible by K |
| Thu Oct 15 | Kadane's algorithm and subarray maxima | [E] 121. Best Time to Buy and Sell Stock · [M] 53. Maximum Subarray · [M] 152. Maximum Product Subarray · [M] 918. Maximum Sum Circular Subarray |
| Fri Oct 16 | Rearrangement and in-place tricks | [M] 31. Next Permutation · [M] 2149. Rearrange Array Elements by Sign · [M] 128. Longest Consecutive Sequence · [H★] 41. First Missing Positive |
| Sat Oct 17 | Intervals + first Hard problem | [M] 56. Merge Intervals · [M] 57. Insert Interval · [M] 435. Non-overlapping Intervals · [H] 42. Trapping Rain Water |
| **Sun Oct 18** | **Self-test:** [E] 905. Sort Array By Parity · [M] 525. Contiguous Array · [M] 1094. Car Pooling |

**Milestone:** You can recognise when a problem needs two pointers, a prefix sum, or Kadane's algorithm, and you have solved your first Hard problem (with help is fine).

---

### Week 3 · Oct 19–25 · Hashing, Strings, Sliding Window
**Resources:** Striver A2Z (strings + sliding window section), AV *Sliding Window* playlist, NC *Sliding Window*
**Key concepts:** frequency maps (`int[26]` vs `HashMap`) · anagram signatures · `StringBuilder` vs string concatenation (why `+` in a loop is O(n²)) · expand-around-centre for palindromes · fixed-size window · variable window (shrink while invalid) · the "at most K" minus "at most K-1" trick

| Day | Concept focus | Problems |
|---|---|---|
| Mon Oct 19 | Hashing patterns | [E] 217. Contains Duplicate · [E] 242. Valid Anagram · [E] 205. Isomorphic Strings · [M] 49. Group Anagrams · [M] 347. Top K Frequent Elements |
| Tue Oct 20 | String basics and parsing | [E] 14. Longest Common Prefix · [E] 13. Roman to Integer · [M] 12. Integer to Roman · [M] 151. Reverse Words in a String · [M] 8. String to Integer (atoi) |
| Wed Oct 21 | Palindromes and string frequency | [E] 796. Rotate String · [M] 5. Longest Palindromic Substring · [M] 647. Palindromic Substrings · [M] 451. Sort Characters By Frequency · [M★] 6. Zigzag Conversion |
| Thu Oct 22 | Fixed-size sliding window | [E] 643. Maximum Average Subarray I · [M] 1456. Maximum Number of Vowels in a Substring of Given Length · [M] 438. Find All Anagrams in a String · [M] 567. Permutation in String |
| Fri Oct 23 | Variable-size sliding window | [M] 3. Longest Substring Without Repeating Characters · [M] 424. Longest Repeating Character Replacement · [M] 1004. Max Consecutive Ones III · [M] 209. Minimum Size Subarray Sum · [M★] 904. Fruit Into Baskets |
| Sat Oct 24 | Counting windows ("at most K") | [M] 930. Binary Subarrays With Sum · [M] 1248. Count Number of Nice Subarrays · [H] 76. Minimum Window Substring · [H★] 992. Subarrays with K Different Integers |
| **Sun Oct 25** | **Self-test:** [E] 383. Ransom Note · [M] 1423. Maximum Points You Can Obtain from Cards · [M] 395. Longest Substring with At Least K Repeating Characters |

**Milestone:** You can write a variable sliding window template from memory and solve most string Mediums in 30 minutes.

---

### Week 4 · Oct 26–Nov 1 · Sorting + Binary Search
**Resources:** AB (merge sort, quick sort), Striver A2Z Step 2 (sorting) + Step 4 (binary search), AV *Binary Search* playlist, LC Explore *Binary Search*
**Key concepts:** bubble/selection/insertion sort (know them, never use them) · merge sort and counting inversions · quick sort and Quickselect · stable vs unstable sorts · custom `Comparator` · binary search invariants (`lo <= hi` vs `lo < hi`, and `mid = lo + (hi-lo)/2`) · lower and upper bound · searching rotated arrays · **binary search on the answer** (monotonic predicate)

| Day | Concept focus | Problems |
|---|---|---|
| Mon Oct 26 | Sorting algorithms; implement merge sort and quick sort | [E] 1636. Sort Array by Increasing Frequency · [M] 912. Sort an Array (implement both merge sort and quick sort) · [M] 179. Largest Number · [M] 274. H-Index |
| Tue Oct 27 | Merge-sort applications and Quickselect | [E] 1122. Relative Sort Array · [M] 215. Kth Largest Element in an Array · [H] 493. Reverse Pairs · GfG: Count Inversions |
| Wed Oct 28 | Binary search basics, lower and upper bound | [E] 704. Binary Search · [E] 35. Search Insert Position · [E] 69. Sqrt(x) · [E] 374. Guess Number Higher or Lower · [M] 34. Find First and Last Position of Element in Sorted Array |
| Thu Oct 29 | Rotated arrays and peaks | [M] 33. Search in Rotated Sorted Array · [M] 81. Search in Rotated Sorted Array II · [M] 153. Find Minimum in Rotated Sorted Array · [M] 162. Find Peak Element · [M] 540. Single Element in a Sorted Array |
| Fri Oct 30 | **Binary search on the answer** | [M] 875. Koko Eating Bananas · [M] 1011. Capacity To Ship Packages Within D Days · [M] 1482. Minimum Number of Days to Make m Bouquets · [M] 1283. Find the Smallest Divisor Given a Threshold · [H] 410. Split Array Largest Sum |
| Sat Oct 31 | Binary search on 2D data + Hard | [E] 1539. Kth Missing Positive Number · [M] 74. Search a 2D Matrix · [M] 240. Search a 2D Matrix II · [M] 981. Time Based Key-Value Store · [H★] 4. Median of Two Sorted Arrays |
| **Sun Nov 1** | **Self-test:** [M] 852. Peak Index in a Mountain Array · [M] 2187. Minimum Time to Complete Trips · [H] 719. Find K-th Smallest Pair Distance |

**Milestone:** You can spot a monotonic predicate and apply binary search on the answer. You know merge sort's O(n log n) proof.

---

### Week 5 · Nov 2–8 · Recursion + Backtracking
**Resources:** KK (recursion series, the best for beginners), Striver A2Z Step 6 (recursion), AV *Recursion* playlist
**Key concepts:** base case, recursive call, and how the call stack works · drawing recursion trees · the include/exclude pattern · backtracking as choose → explore → un-choose · deduplication by sorting first and skipping repeated values · pruning · complexity of exponential search (2ⁿ, n!)

| Day | Concept focus | Problems |
|---|---|---|
| Mon Nov 2 | Recursion fundamentals and the call stack | [E] 509. Fibonacci Number · [M] 1922. Count Good Numbers · [M] 779. K-th Symbol in Grammar · [M] 1823. Find the Winner of the Circular Game |
| Tue Nov 3 | Subsets and subsequences (include/exclude) | [M] 78. Subsets · [M] 90. Subsets II · [M] 17. Letter Combinations of a Phone Number · [M] 22. Generate Parentheses |
| Wed Nov 4 | Combinations | [M] 77. Combinations · [M] 39. Combination Sum · [M] 40. Combination Sum II · [M] 216. Combination Sum III |
| Thu Nov 5 | Permutations and partitioning | [M] 46. Permutations · [M] 47. Permutations II · [M] 131. Palindrome Partitioning · [H★] 60. Permutation Sequence |
| Fri Nov 6 | Grid and board backtracking | [M] 79. Word Search · [H] 51. N-Queens · [H] 52. N-Queens II · [H★] 37. Sudoku Solver |
| Sat Nov 7 | Mixed backtracking + pruning | [M] 93. Restore IP Addresses · [M] 698. Partition to K Equal Sum Subsets · GfG: Rat in a Maze · [H★] 282. Expression Add Operators |
| **Sun Nov 8** | **Self-test:** [E] 401. Binary Watch · [M] 784. Letter Case Permutation · [M] 473. Matchsticks to Square |

**Milestone:** You can write the subsets, permutations, and combination-sum templates from memory and draw their recursion trees.
*Festival note:* Diwali falls around this time. If you take days off, use §4 rule B.

---

### Week 6 · Nov 9–15 · Linked Lists
**Resources:** KK (linked list lectures), Striver A2Z Step 7, LC Explore *Linked List*
**Key concepts:** implementing singly and doubly linked lists · the dummy-head trick · fast/slow pointers (finding the middle, Floyd's cycle detection and cycle start) · iterative and recursive reversal · reversing a sub-list and reversing in k-groups · merging lists · HashMap + doubly linked list for LRU

| Day | Concept focus | Problems |
|---|---|---|
| Mon Nov 9 | Build a linked list from scratch; basics | [E] 876. Middle of the Linked List · [E] 206. Reverse Linked List · [E] 203. Remove Linked List Elements · [M] 237. Delete Node in a Linked List · [M] 707. Design Linked List |
| Tue Nov 10 | Fast/slow pointers | [E] 141. Linked List Cycle · [E] 234. Palindrome Linked List · [M] 142. Linked List Cycle II · [M] 19. Remove Nth Node From End of List · [M] 2095. Delete the Middle Node of a Linked List |
| Wed Nov 11 | Merging, sorting, arithmetic on lists | [E] 21. Merge Two Sorted Lists · [E] 160. Intersection of Two Linked Lists · [M] 2. Add Two Numbers · [M] 328. Odd Even Linked List · [M] 148. Sort List |
| Thu Nov 12 | Reversal patterns | [M] 92. Reverse Linked List II · [M] 24. Swap Nodes in Pairs · [M] 61. Rotate List · [H] 25. Reverse Nodes in k-Group |
| Fri Nov 13 | Doubly linked lists and multi-pointer structures | [M] 143. Reorder List · [M] 138. Copy List with Random Pointer · [M] 430. Flatten a Multilevel Doubly Linked List · [H] 23. Merge k Sorted Lists (divide and conquer) |
| Sat Nov 14 | Design with linked lists | [E] 83. Remove Duplicates from Sorted List · [M] 82. Remove Duplicates from Sorted List II · [M] 146. LRU Cache · [H★] 460. LFU Cache |
| **Sun Nov 15** | **Self-test:** [E] 1290. Convert Binary Number in a Linked List to Integer · [M] 86. Partition List · [M] 445. Add Two Numbers II |

**Milestone:** You can implement LRU Cache from scratch in under 30 minutes and reverse any segment of a list without bugs.

---

### Week 7 · Nov 16–22 · Stacks, Queues, Monotonic Stack, Deque
**Resources:** Striver A2Z Step 9, AV *Stack* playlist (monotonic stack), LC Explore *Queue & Stack*
**Key concepts:** `ArrayDeque` as both stack and queue (never use `Stack`) · balanced brackets · expression evaluation · **monotonic stack** (next greater/smaller element, previous smaller element) · contribution technique (sum of subarray minimums) · monotonic deque for sliding window max · circular queue

| Day | Concept focus | Problems |
|---|---|---|
| Mon Nov 16 | Stack/queue implementations | [E] 20. Valid Parentheses · [E] 232. Implement Queue using Stacks · [E] 225. Implement Stack using Queues · [E] 1047. Remove All Adjacent Duplicates In String · [M] 155. Min Stack |
| Tue Nov 17 | Expression evaluation and parsing | [M] 150. Evaluate Reverse Polish Notation · [M] 394. Decode String · [M] 71. Simplify Path · [M] 227. Basic Calculator II · [H★] 224. Basic Calculator |
| Wed Nov 18 | Monotonic stack I | [E] 496. Next Greater Element I · [M] 503. Next Greater Element II · [M] 739. Daily Temperatures · [M] 901. Online Stock Span · [M] 402. Remove K Digits |
| Thu Nov 19 | Monotonic stack II (contribution technique, histogram) | [M] 907. Sum of Subarray Minimums · [M] 2104. Sum of Subarray Ranges · [H] 84. Largest Rectangle in Histogram · [H★] 85. Maximal Rectangle |
| Fri Nov 20 | Queues and monotonic deque | [E] 933. Number of Recent Calls · [M] 622. Design Circular Queue · [M] 735. Asteroid Collision · [M] 853. Car Fleet · [H] 239. Sliding Window Maximum |
| Sat Nov 21 | Stack-based design + Hard | [M] 341. Flatten Nested List Iterator · [M] 316. Remove Duplicate Letters · [H] 32. Longest Valid Parentheses · [H★] 895. Maximum Frequency Stack |
| **Sun Nov 22** | **Self-test:** [E] 1021. Remove Outermost Parentheses · [M] 1019. Next Greater Node In Linked List · [M] 456. 132 Pattern |
| | *From this Sunday on, also join the LeetCode Weekly Contest (Sun 8:00 AM IST) when possible; it counts as practice.* |

**Milestone:** When you see "next greater" or "previous smaller" in a problem, you think monotonic stack immediately.

---

### Week 8 · Nov 23–29 · Binary Trees
**Resources:** Striver A2Z Step 13 (the tree series is excellent), KK (trees), LC Explore *Binary Tree*, VisuAlgo
**Key concepts:** recursive and iterative pre/in/post-order traversal · BFS level order with a queue · height/depth computed bottom-up with return values · the "global answer + return a different value" pattern (diameter, max path sum) · vertical order and views · LCA · converting a tree to a graph (parent map) · construction from traversals · serialisation

| Day | Concept focus | Problems |
|---|---|---|
| Mon Nov 23 | Traversals, recursive and iterative | [E] 144. Binary Tree Preorder Traversal · [E] 94. Binary Tree Inorder Traversal · [E] 145. Binary Tree Postorder Traversal · [M] 102. Binary Tree Level Order Traversal |
| Tue Nov 24 | Height-based recursion | [E] 104. Maximum Depth of Binary Tree · [E] 111. Minimum Depth of Binary Tree · [E] 110. Balanced Binary Tree · [E] 543. Diameter of Binary Tree · [H] 124. Binary Tree Maximum Path Sum |
| Wed Nov 25 | Structure comparison and BFS variants | [E] 100. Same Tree · [E] 101. Symmetric Tree · [E] 226. Invert Binary Tree · [E] 572. Subtree of Another Tree · [M] 103. Binary Tree Zigzag Level Order Traversal · [M] 199. Binary Tree Right Side View |
| Thu Nov 26 | Paths, views, width | [E] 257. Binary Tree Paths · [E] 112. Path Sum · [M] 113. Path Sum II · [M] 437. Path Sum III · [M] 662. Maximum Width of Binary Tree · [H★] 987. Vertical Order Traversal of a Binary Tree |
| Fri Nov 27 | LCA, trees as graphs | [M] 236. Lowest Common Ancestor of a Binary Tree · [M] 1448. Count Good Nodes in Binary Tree · [M] 863. All Nodes Distance K in Binary Tree · [M] 2385. Amount of Time for Binary Tree to Be Infected |
| Sat Nov 28 | Construction and serialisation | [M] 105. Construct Binary Tree from Preorder and Inorder Traversal · [M] 106. Construct Binary Tree from Inorder and Postorder Traversal · [M] 114. Flatten Binary Tree to Linked List · [H] 297. Serialize and Deserialize Binary Tree |
| **Sun Nov 29** | **Self-test:** [E] 404. Sum of Left Leaves · [M] 1302. Deepest Leaves Sum · [H] 968. Binary Tree Cameras |

**Milestone:** You can solve 80% of tree Mediums with "what does my recursive call return?" thinking.

---

### Week 9 · Nov 30–Dec 6 · BST, Heaps / Priority Queue, Tries
**Resources:** Striver A2Z Steps 14 (BST), 17 (heaps), and 16 (tries) · AV *Heap* playlist · `TreeMap`/`TreeSet` docs (`floorKey`, `ceilingKey`)
**Key concepts:** BST property and in-order = sorted · insert/delete/validate with min/max bounds · `PriorityQueue` with comparators · top-K problems using a heap of size K · two heaps for the median · K-way merge · `TreeMap` as a sorted map · trie node design (`children[26]`, `isEnd`) · prefix search · binary trie for XOR

| Day | Concept focus | Problems |
|---|---|---|
| Mon Nov 30 | BST operations | [E] 700. Search in a Binary Search Tree · [E] 108. Convert Sorted Array to Binary Search Tree · [M] 701. Insert into a Binary Search Tree · [M] 450. Delete Node in a BST · [M] 98. Validate Binary Search Tree |
| Tue Dec 1 | BST applications | [E] 653. Two Sum IV - Input is a BST · [M] 230. Kth Smallest Element in a BST · [M] 235. Lowest Common Ancestor of a Binary Search Tree · [M] 1008. Construct Binary Search Tree from Preorder Traversal · [M] 173. Binary Search Tree Iterator · [M★] 99. Recover Binary Search Tree |
| Wed Dec 2 | Implement a min-heap; top-K problems | [E] 1046. Last Stone Weight · [E] 703. Kth Largest Element in a Stream · [M] 973. K Closest Points to Origin · [M] 378. Kth Smallest Element in a Sorted Matrix |
| Thu Dec 3 | Heap scheduling patterns | [M] 621. Task Scheduler · [M] 767. Reorganize String · [M] 355. Design Twitter · [M] 846. Hand of Straights |
| Fri Dec 4 | Two heaps + Hard heap problems | [M] 1642. Furthest Building You Can Reach · [H] 295. Find Median from Data Stream · [H] 502. IPO · [H★] 480. Sliding Window Median · [H★] 632. Smallest Range Covering Elements from K Lists |
| Sat Dec 5 | Tries | [M] 208. Implement Trie (Prefix Tree) · [M] 211. Design Add and Search Words Data Structure · [M] 1268. Search Suggestions System · [M] 421. Maximum XOR of Two Numbers in an Array · [H★] 212. Word Search II |
| **Sun Dec 6** | **Self-test:** [E] 938. Range Sum of BST · [M] 648. Replace Words · [H] 1383. Maximum Performance of a Team |

**Milestone:** You can pick the right tool among `PriorityQueue`, `TreeMap`, and a trie. You can explain the O(n log k) cost of the top-K approach.

---

### Week 10 · Dec 7–13 · Graphs I: Traversal, Grids, Cycles, Topological Sort
**Resources:** Striver A2Z Step 15 (graph series, the best free graph course), WF (graph theory playlist), NC *Graphs*
**Key concepts:** adjacency list vs matrix · BFS/DFS on graphs and grids (4-direction arrays) · connected components · multi-source BFS · cycle detection in undirected graphs (parent tracking) and directed graphs (DFS colouring) · bipartite check · topological sort (Kahn's BFS + DFS) · BFS shortest path on unweighted graphs

| Day | Concept focus | Problems |
|---|---|---|
| Mon Dec 7 | Graph representation, BFS/DFS, components | [E] 733. Flood Fill · [E] 1971. Find if Path Exists in Graph · [M] 547. Number of Provinces · [M] 200. Number of Islands · [M] 133. Clone Graph |
| Tue Dec 8 | Grid BFS and multi-source BFS | [M] 994. Rotting Oranges · [M] 542. 01 Matrix · [M] 130. Surrounded Regions · [M] 1020. Number of Enclaves · [M] 417. Pacific Atlantic Water Flow |
| Wed Dec 9 | Cycle detection, bipartite graphs | [M] 785. Is Graph Bipartite? · [M] 886. Possible Bipartition · [M] 802. Find Eventual Safe States · [M] 1559. Detect Cycles in 2D Grid |
| Thu Dec 10 | Topological sort | [M] 207. Course Schedule · [M] 210. Course Schedule II · [M] 310. Minimum Height Trees · [M] 2115. Find All Possible Recipes from Given Supplies · GfG: Alien Dictionary |
| Fri Dec 11 | BFS shortest path (unweighted) | [M] 1091. Shortest Path in Binary Matrix · [M] 752. Open the Lock · [M] 433. Minimum Genetic Mutation · [H] 127. Word Ladder · [H★] 126. Word Ladder II |
| Sat Dec 12 | Mixed graph practice | [M] 695. Max Area of Island · [M] 1254. Number of Closed Islands · [M] 841. Keys and Rooms · [M] 399. Evaluate Division · [H] 329. Longest Increasing Path in a Matrix |
| **Sun Dec 13** | **Self-test:** [E] 463. Island Perimeter · [M] 1162. As Far from Land as Possible · [M] 1376. Time Needed to Inform All Employees |

**Milestone:** You can turn a word problem into a graph (nodes = ?, edges = ?) and choose between BFS, DFS, and topological sort.

---

### Week 11 · Dec 14–20 · Graphs II (Shortest Paths, DSU, MST, Bridges) + Greedy
**Resources:** Striver A2Z Step 15 (second half), AB (Dijkstra, Bellman-Ford, Prim, Kruskal), WF (Union-Find, Tarjan), Striver A2Z Step 12 (greedy)
**Key concepts:** Dijkstra with a `PriorityQueue` (and why it fails with negative edges) · Bellman-Ford / bounded relaxations · Floyd-Warshall · Union-Find with path compression and union by rank · Kruskal and Prim · bridges (Tarjan) · Eulerian paths (Hierholzer) · **greedy:** the exchange argument, sorting by end time, "why does greedy work here?"

| Day | Concept focus | Problems |
|---|---|---|
| Mon Dec 14 | Dijkstra | [M] 743. Network Delay Time · [M] 1631. Path With Minimum Effort · [M] 1514. Path with Maximum Probability · [H] 778. Swim in Rising Water |
| Tue Dec 15 | Bellman-Ford, Floyd-Warshall, counting shortest paths | [M] 787. Cheapest Flights Within K Stops · [M] 1334. Find the City With the Smallest Number of Neighbors at a Threshold Distance · [M] 1976. Number of Ways to Arrive at Destination |
| Wed Dec 16 | Union-Find (DSU) | [M] 684. Redundant Connection · [M] 1319. Number of Operations to Make Network Connected · [M] 721. Accounts Merge · [M] 947. Most Stones Removed with Same Row or Column · [H★] 827. Making A Large Island |
| Thu Dec 17 | MST, bridges, Eulerian path | [M] 1584. Min Cost to Connect All Points (Prim and Kruskal) · [H] 1192. Critical Connections in a Network · [H★] 332. Reconstruct Itinerary |
| Fri Dec 18 | Greedy I | [E] 455. Assign Cookies · [E] 860. Lemonade Change · [M] 55. Jump Game · [M] 45. Jump Game II · [M] 678. Valid Parenthesis String |
| Sat Dec 19 | Greedy II (intervals and two-pass) | [M] 134. Gas Station · [M] 452. Minimum Number of Arrows to Burst Balloons · [M] 763. Partition Labels · [H] 135. Candy · [M★] 1029. Two City Scheduling |
| **Sun Dec 20** | **Self-test:** [E] 1005. Maximize Sum Of Array After K Negations · [M] 1202. Smallest String With Swaps · [H] 1368. Minimum Cost to Make at Least One Valid Path in a Grid |

**Milestone:** You can write Dijkstra and DSU from memory in under 10 minutes each, and you can justify a greedy choice instead of guessing.

---

### Week 12 · Dec 21–27 · Dynamic Programming I
**Resources:** Striver A2Z Step 16 (the DP series is excellent), AV *Dynamic Programming* playlist (knapsack and LCS families), NC *1-D DP* / *2-D DP*
**Key concepts:** recursion → memoisation → tabulation → space optimisation (do all four for the first 10 problems) · state definition is everything (`dp[i]` = ?) · 1D linear DP · grid DP · 0/1 knapsack (subset sum, target sum) · unbounded knapsack · LCS family on two strings

| Day | Concept focus | Problems |
|---|---|---|
| Mon Dec 21 | DP intro: memoisation vs tabulation | [E] 70. Climbing Stairs · [E] 746. Min Cost Climbing Stairs · [E] 1137. N-th Tribonacci Number · [M] 198. House Robber · [M] 213. House Robber II |
| Tue Dec 22 | 1D DP | [M] 740. Delete and Earn · [M] 91. Decode Ways · [M] 139. Word Break · [M] 322. Coin Change |
| Wed Dec 23 | Grid DP | [M] 62. Unique Paths · [M] 63. Unique Paths II · [M] 64. Minimum Path Sum · [M] 120. Triangle · [M] 931. Minimum Falling Path Sum · [H★] 1463. Cherry Pickup II |
| Thu Dec 24 | 0/1 knapsack family | GfG: 0-1 Knapsack · GfG: Subset Sum Problem · [M] 416. Partition Equal Subset Sum · [M] 494. Target Sum · [M] 1049. Last Stone Weight II |
| Fri Dec 25 | Unbounded knapsack *(Christmas: shift to Sunday if needed)* | GfG: Rod Cutting · [M] 518. Coin Change II · [M] 279. Perfect Squares · [M] 377. Combination Sum IV |
| Sat Dec 26 | LCS family | [M] 1143. Longest Common Subsequence · [M] 583. Delete Operation for Two Strings · [M] 516. Longest Palindromic Subsequence · [H] 1312. Minimum Insertion Steps to Make a String Palindrome · [H★] 1092. Shortest Common Supersequence |
| **Sun Dec 27** | **Self-test:** [E] 1025. Divisor Game · [M] 1155. Number of Dice Rolls With Target Sum · [M] 1035. Uncrossed Lines |

**Milestone:** For any DP problem you can write the state, transition, and base case **in words** before you code.

---

### Week 13 · Dec 28–Jan 3 · DP II + Advanced (Segment Tree, Fenwick Tree, KMP)
**Resources:** Striver A2Z Step 16 (second half), AV (Matrix Chain Multiplication playlist), WF (segment tree, Fenwick tree), CPA (prefix function / KMP)
**Key concepts:** DP on strings (edit distance, matching) · LIS in O(n²) and in O(n log n) with binary search · stock problems as a state machine · interval/partition DP (MCM pattern) · DP on trees · square-submatrix DP · bitmask state · **segment tree** (build, query, point update) · **Fenwick tree** · **KMP** prefix function

| Day | Concept focus | Problems |
|---|---|---|
| Mon Dec 28 | DP on strings | [M] 72. Edit Distance · [H] 115. Distinct Subsequences · [H] 44. Wildcard Matching · [H★] 10. Regular Expression Matching |
| Tue Dec 29 | LIS family | [M] 300. Longest Increasing Subsequence · [M] 368. Largest Divisible Subset · [M] 1048. Longest String Chain · [M] 673. Number of Longest Increasing Subsequence · [H★] 354. Russian Doll Envelopes |
| Wed Dec 30 | Stocks as a state machine | [M] 122. Best Time to Buy and Sell Stock II · [M] 309. Best Time to Buy and Sell Stock with Cooldown · [M] 714. Best Time to Buy and Sell Stock with Transaction Fee · [H] 123. Best Time to Buy and Sell Stock III · [H★] 188. Best Time to Buy and Sell Stock IV |
| Thu Dec 31 | Interval / partition DP (MCM) | GfG: Matrix Chain Multiplication · [M] 1039. Minimum Score Triangulation of Polygon · [H] 1547. Minimum Cost to Cut a Stick · [H] 312. Burst Balloons · [H★] 132. Palindrome Partitioning II |
| Fri Jan 1 | DP on trees and squares, bitmask *(New Year: shift to Sunday if needed)* | [M] 337. House Robber III · [M] 221. Maximal Square · [M] 1277. Count Square Submatrices with All Ones · [H★] 847. Shortest Path Visiting All Nodes |
| Sat Jan 2 | Segment tree, Fenwick tree, KMP | [E] 28. Find the Index of the First Occurrence in a String (solve with KMP) · [M] 307. Range Sum Query - Mutable (segment tree, then Fenwick tree) · [H] 315. Count of Smaller Numbers After Self · [H★] 1392. Longest Happy Prefix · [H★] 214. Shortest Palindrome |
| **Sun Jan 3** | **Self-test:** [E] 392. Is Subsequence · [M] 1027. Longest Arithmetic Subsequence · [H] 1235. Maximum Profit in Job Scheduling — **then a Phase 1 retrospective** (see §2.3) |

**Milestone (end of Phase 1):** ~300+ problems solved across every core topic. You have a personal template file for each pattern.

---

## 2. Weekly self-test & milestones

### 2.1 Sunday structure (5h)
| Time | Activity |
|---|---|
| 1h30 | **Timed self-test**: the 3 unseen problems listed for that week, no hints, all in one sitting |
| 30m | **Concept quiz:** write, from memory, the week's templates (e.g. the sliding window or Dijkstra skeleton) and the complexity of each pattern |
| 3h00 | **Buffer:** first catch up on missed core problems, then clear the spaced-repetition queue, then stretch problems |

### 2.2 Pass / fail rule
- **Pass:** you solve at least 2 of the 3 problems within 90 minutes **and** reproduce the templates correctly.
- **Fail:** the app flags the topic as **weak**. Add 2 extra problems from that topic to next week's review blocks, and re-take a fresh 3-problem test on that topic the following Sunday. Pick similar problems from LeetCode's topic tag.

### 2.3 Phase 1 retrospective (Sun Jan 3)
Review the dashboard and write down three things:
1. Your **3 weakest topics** (lowest confidence and self-test scores). These drive Weeks 18–19.
2. All **stretch problems** you skipped. These go into the Phase 2 pool.
3. Your average solve time by difficulty. Targets: Easy ≤ 15 min, Medium ≤ 30 min, Hard ≤ 50 min.

---

## 3. Phase 2 — Revision & Mock Practice (Weeks 14–22)

### 3.1 Daily template (Mon–Sat, 5h)
| Block | Time | What |
|---|---|---|
| Spaced-repetition queue | 1h00 | Re-solve every problem the app says is due, **from a blank editor**. Re-rate your confidence after each one. |
| Timed practice | 2h00 | The day's focus (see the weekly table): a topic re-solve set, unseen problems, or a mock |
| Post-mortem | 1h15 | For every miss: the root cause (didn't recognise the pattern / implementation bug / edge case / too slow) and the fix, written into notes |
| Concept repair | 45m | Re-watch or re-read the concept behind today's misses. Update your pattern template file. |

**Sources for unseen problems (free):** LeetCode *Top Interview 150* study plan, NeetCode 150, Striver's SDE Sheet, the LeetCode topic tags sorted by acceptance rate, and LeetCode contest archives.

### 3.2 Week-by-week
| Week | Dates | Focus | Day by day (Mon → Sat) | Mocks / contests |
|---|---|---|---|---|
| **14** | Jan 4–10 | Topic sweep 1: linear structures | Mon arrays + two pointers · Tue prefix sum / Kadane / intervals · Wed hashing + strings · Thu sliding window · Fri binary search · Sat sorting + a mixed timed set. **Each day:** re-solve 5 of your lowest-confidence problems from the topic, then 2 unseen Mediums. | 1 self-mock (Sun) + weekly contest |
| **15** | Jan 11–17 | Topic sweep 2: recursive structures | Mon recursion · Tue backtracking · Wed linked lists · Thu stacks/queues + monotonic stack · Fri trees (traversal/height) · Sat trees (LCA/construction) | 1 self-mock + contest |
| **16** | Jan 18–24 | Topic sweep 3: BST, heaps, graphs | Mon BST + TreeMap · Tue heaps + tries · Wed graph BFS/DFS + grids · Thu topological sort + cycles · Fri Dijkstra / Bellman-Ford · Sat DSU + MST | 2 mocks (Wed evening, Sun) + contest |
| **17** | Jan 25–31 | Topic sweep 4: DP, greedy, advanced | Mon greedy · Tue 1D + grid DP · Wed knapsack · Thu string DP + LIS · Fri stocks + interval DP · Sat segment tree / KMP + all ★ stretch problems you skipped | 2 mocks + contest |
| **18** | Feb 1–7 | **Weak-area week 1** | 60% of practice time on your bottom 3 topics (from the app's weak-topics panel); 40% on mixed random Mediums. Fri = Hard day (3 Hards). | 3 mocks (Tue, Thu, Sun) + contest |
| **19** | Feb 8–14 | **Weak-area week 2** | Re-check the weak-topics panel; it should have changed. Same 60/40 split. Sat = a full "onsite simulation": 3 mocks back to back with 15-minute breaks. | 3 mocks + contest |
| **20** | Feb 15–21 | Interview simulation 1 | Blind 75, first half, in timed mode (~6 per day, aiming for interview speed) plus the spaced-repetition queue | 4 mocks (Tue, Thu, Sat, Sun) |
| **21** | Feb 22–28 | Interview simulation 2 | Blind 75, second half, timed. Thu = Hard day. Sat = second onsite simulation. | 4 mocks |
| **22** | Mar 1–7 | Taper & consolidate | Re-solve only your 50 starred "must-remember" problems. Read through your pattern template file. Lighter days (4h). | 2 mocks (Tue, Sat); Sun Mar 7 = final review |

### 3.3 Mock interview protocol
- **Format:** 45 minutes, 2 unseen problems (Medium + Medium/Hard), picked at random by the app or by a friend.
- **Rules:** talk aloud the whole time · plain editor without autocomplete (or paper) · state the brute force first, then optimise · dry-run with your own test cases before you say "done".
- **Score each mock** from 1 to 4 on: Communication · Problem solving · Code quality · Testing/edge cases. Log the scores in the app.
- **Peer mocks (free):** a friend preparing for interviews, or a free peer-mock platform such as Pramp (now part of Exponent). Aim for at least 1 peer mock per week from Week 16, because talking to a real human matters for FAANG interviews.
- **Contests:** LeetCode Weekly (Sun 8:00 AM IST) and Biweekly (alternate Saturdays, 8:00 PM IST). Contests are the best free test of solving under time pressure.

### 3.4 Weak-area definition (what the app uses)
A topic is **weak** if any of these is true:
- average confidence is below 3
- self-test or mock solve rate is below 60%
- median solve time is above target (Easy 15 min, Medium 30 min, Hard 50 min)
- more than 30% of its problems are in `needs revision`

---

## 4. Falling behind — buffer & catch-up rules

| Rule | Situation | What to do |
|---|---|---|
| **A** | Behind by ≤ 1 day | Absorb it in Sunday's 3-hour buffer. Nothing else changes. |
| **B** | Behind by 2–3 days (festival, illness, work crunch) | Drop all ★ stretch problems for the current and the next week (they move to the Phase 2 pool), then use the next **two** Sundays' buffers. |
| **C** | Behind by 4 days to 1 week | Do rule B, **and** borrow up to 1 week from Phase 2: Topic Sweep weeks 14–15 merge into one week. The app's catch-up view re-flows the dates. |
| **D** | Behind by more than 1 week | Re-baseline: the app shifts every remaining date forward and drops Week 22's taper. Never borrow from Weeks 18–21 (weak areas + mocks). They matter most for actually passing interviews. |
| **E** | A day with only 1 hour | "Minimum viable day": clear the spaced-repetition queue + 1 problem. This keeps your streak and your memory alive. |

**Hard rules:**
1. **Never skip a topic.** Shrink it by doing core problems only, but touch every topic.
2. **Never skip the weekly self-test.** Take it late if you must, but take it.
3. **No 8-hour binge days to catch up.** Sustained 5-hour days beat sprints. Burnout is the #1 plan-killer.
4. **Order of priority when time is short:** spaced-repetition queue → core problems → concept video → stretch problems.

---

## 5. Totals

> Counts are generated from the lists above. "Core" excludes ★ stretch problems; GfG problems and self-tests are counted separately.

| Week | Topic | Core E | Core M | Core H | ★ Stretch | GfG | Self-test |
|---|---|---|---|---|---|---|---|
| 1 | Foundations, maths, bits, arrays | 18 | 7 | 0 | 4 | 0 | 3 |
| 2 | Two pointers, prefix sum, Kadane, intervals | 7 | 16 | 1 | 3 | 0 | 3 |
| 3 | Hashing, strings, sliding window | 7 | 17 | 1 | 3 | 0 | 3 |
| 4 | Sorting + binary search | 7 | 17 | 2 | 1 | 1 | 3 |
| 5 | Recursion + backtracking | 1 | 17 | 2 | 3 | 1 | 3 |
| 6 | Linked lists | 8 | 16 | 2 | 1 | 0 | 3 |
| 7 | Stacks, queues, monotonic stack | 6 | 16 | 3 | 3 | 0 | 3 |
| 8 | Binary trees | 13 | 13 | 2 | 1 | 0 | 3 |
| 9 | BST, heaps, tries | 5 | 18 | 2 | 4 | 0 | 3 |
| 10 | Graphs I | 2 | 23 | 2 | 1 | 1 | 3 |
| 11 | Graphs II + greedy | 2 | 17 | 3 | 3 | 0 | 3 |
| 12 | DP I | 3 | 20 | 1 | 2 | 3 | 3 |
| 13 | DP II + advanced | 1 | 13 | 6 | 7 | 1 | 3 |
| **Total** | | **80** | **210** | **27** | **36** | **7** | **39** |

- **Phase 1 core:** 317 LeetCode problems (80 E / 210 M / 27 H), about 4 a day
- **Phase 1 everything:** 317 core + 36 stretch + 7 GfG + 39 self-test = **~400 problems**
- **Phase 2:** ~100–120 new unseen problems, plus re-solving the whole bank through spaced repetition, plus ~25 mocks
- **Final tally by Mar 7:** ~500 unique problems, ~75% of them Medium, which is the FAANG sweet spot

---

## 6. Beyond DSA (for the 7 → 20 LPA jump)
DSA gets you through the coding rounds. At 20 LPA, product companies and FAANG also test:
- **Low-level design (LLD)**, from ~Week 14: SOLID principles, design patterns, and classic problems (Parking Lot, BookMyShow, Splitwise). This fits your Java background, so spend 2–3 hours a week of your Sunday buffer on it.
- **System design basics:** caching, databases, queues, load balancing, at an awareness level, from ~Week 18.
- **Behavioural (STAR stories)** in Week 22, prepared from your real work projects.
- **Start applying and getting referrals around Week 16–17.** Interview pipelines take 3–6 weeks, so your interviews will land right as you peak.

---

## 7. Full-stack project track (.NET · React · Node.js), 1h every weekday

**Format:** 1 hour a day, Mon–Fri, during office hours (~5h a week, ~110h in total). Each day = **📖 Learn** one concept (~20 min, official docs) → **🛠 Build** it into the project (~40 min). Each Friday ends with a **✅ checkpoint**: a 15–20 min no-docs exercise that proves the week stuck. Every area is a from-scratch roadmap, and its project is the capstone. DSA always comes first. If a day gets busy, skip the project hour, never the DSA blocks.
> Use your **personal laptop and personal GitHub account** for this, and check that your company's policy allows learning during work hours. Never mix in company code.

**Rules for "built from scratch"** (the app's checkbox only counts if all three are true):
1. **No code-along tutorials.** Read the official docs for the *one* thing you need (nodejs.org, expressjs.com, learn.microsoft.com, react.dev), then build it yourself.
2. **If you're stuck for more than 20 minutes,** look up or ask about that specific thing. If you use AI, ask it to *explain* rather than to write the code.
3. **You can explain every line** you committed. Commit at the end of every session, even if the work is unfinished.

**Why these three projects:** they tell one coherent story for interviews. The .NET API comes first and goes deepest (14 weekly assignments, basic → advanced, alongside your company's .NET course): auth, testing, performance, caching, resilience, messaging, security and deployment. Then a React app on top of it. Node.js comes after the 5-month plan, to show range. The 20 LPA interviews will ask about architecture, auth, testing, and trade-offs, and these projects cover all of them.

### Project 1: JobHunt API (ASP.NET Core / .NET 10 + EF Core + SQL Server), Weeks 1–14
**.NET track, basic → advanced, as 14 weekly assignments:** C# foundations → ASP.NET Core → EF Core → API quality → auth → testing → database performance → caching + rate limiting → resilience + background jobs → logging + monitoring → messaging → security → deployment + scaling → capstone.
*Track job applications, interview rounds and follow-ups. Each assignment adds one production skill to the same app, built alongside your company's .NET course. Every assignment ends with a merged PR and tests.*

#### Week 1 · Assignment 1: C# & .NET foundations
**🎯 Objective:** Set up the JobHunt solution and model the job-search domain in modern C#, with tests from day one.
**🪜 Level:** Basic
**📦 Deliverable:** PR "Domain model" merged: solution with 4 layers, domain entities + rules, xUnit tests ≥ 80% on Domain.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | The .NET SDK and CLI; solutions vs projects; project references; layered architecture | `dotnet new sln` with Api / Application / Domain / Infrastructure projects and the right references | `dotnet build` passes; Api → Application → Domain, Infrastructure → Application |
| Tue | Classes vs records vs structs; value vs reference equality; nullable reference types | Domain: Company, JobApplication, Interview, Note + ApplicationStatus enum | Nullable enabled with zero warnings; value objects are records |
| Wed | Collections and LINQ: Where, Select, GroupBy, OrderBy; deferred execution | LINQ over an in-memory list: applications by status, by company, response rate | A test checks each query's result on sample data |
| Thu | Exceptions and guard clauses; keeping business rules inside entities | Status transitions (Applied → Interviewing → Offer/Rejected) with InvalidStatusTransitionException | Illegal transitions throw; every rule has a test |
| Fri | Unit testing with xUnit: Fact vs Theory, Arrange-Act-Assert, coverage | Domain.Tests project for the rules and the LINQ stats | `dotnet test` is green with ≥ 80% coverage on Domain |

**✅ Checkpoint (Fri, no docs):** From a blank file: a record, an enum, one guarded state transition and a Theory test in 20 minutes

#### Week 2 · Assignment 2: ASP.NET Core essentials
**🎯 Objective:** Turn the domain into a running Web API and understand exactly what happens on every request.
**🪜 Level:** Basic
**📦 Deliverable:** PR "API skeleton" merged: Program.cs with DI, middleware, options and Companies endpoints using DTOs.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | How ASP.NET Core starts: WebApplication builder, Kestrel, Program.cs | The Api project with a health endpoint | GET /health returns 200 |
| Tue | Dependency injection: registering services, constructor injection, singleton vs scoped vs transient | Application service interfaces + in-memory implementations registered in DI | You can swap an implementation in Program.cs without touching the endpoint |
| Wed | The middleware pipeline: order, Use vs Run, writing custom middleware | Request-timing and correlation-id middleware | Every response has X-Correlation-Id and the log shows the duration |
| Thu | Configuration and the Options pattern: appsettings, environments, user-secrets, validation | JobHuntOptions bound and validated at startup | The app refuses to start with invalid config; Development and Production values differ |
| Fri | Controllers vs minimal APIs; routing; DTOs; HTTP status codes | Companies endpoints: list, get, create, update, delete, with DTOs | Correct 200/201/204/404 codes; entities never leave the API |

**✅ Checkpoint (Fri, no docs):** Draw the middleware pipeline and explain the three DI lifetimes from memory

#### Week 3 · Assignment 3: Data with EF Core
**🎯 Objective:** Persist JobHunt in SQL Server with EF Core, behind the Repository + Unit of Work seam from your Patterns Lab.
**🪜 Level:** Basic
**📦 Deliverable:** PR "Persistence" merged: DbContext, migrations, relationships, repositories + unit of work, CRUD on a real database.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | EF Core: DbContext, DbSet, conventions, connection strings | JobHuntDbContext with the SQL Server provider in Infrastructure | The app connects and `dotnet ef dbcontext info` works |
| Tue | Code-first migrations; Fluent API configuration (keys, lengths, required) | Entity configurations + the first migration | Tables in SSMS have the right types and lengths |
| Wed | Relationships: one-to-many, required vs optional, cascade delete | Company → JobApplications → Interviews and Notes | Cascade rules are chosen on purpose and written in the PR |
| Thu | Repository + Unit of Work on top of EF Core (DbContext as the unit of work) | IJobApplicationRepository + IUnitOfWork implemented with EF | Services depend only on interfaces; Save commits once per request |
| Fri | Seeding data; async EF APIs (ToListAsync, SaveChangesAsync) and CancellationToken | Seed sample data; every endpoint uses the database asynchronously | CRUD works end to end against SQL Server |

**✅ Checkpoint (Fri, no docs):** Blank project → entity + DbContext + migration + GET endpoint in 25 minutes

#### Week 4 · Assignment 4: API quality
**🎯 Objective:** Make the API predictable for its clients: validation, one error format, paging and living documentation.
**🪜 Level:** Intermediate
**📦 Deliverable:** PR "API quality" merged: validation, ProblemDetails, filtering + paging, OpenAPI docs, a PATCH endpoint.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Validation: DataAnnotations vs FluentValidation | Validators for the create and update DTOs | Invalid input returns 400 with errors per field |
| Tue | ProblemDetails and global exception handling with IExceptionHandler | Map NotFound, Conflict and Validation exceptions to ProblemDetails | Every error has the same JSON shape and production shows no stack traces |
| Wed | IQueryable vs IEnumerable; filtering, sorting and paging in SQL | GET /applications?status=&company=&sort=&page= returning PagedResult<T> | The logged SQL uses OFFSET/FETCH and the page metadata is correct |
| Thu | OpenAPI: response types, XML comments, examples | OpenAPI document + UI with [ProducesResponseType] on every endpoint | The docs list every status code each endpoint can return |
| Fri | HTTP semantics: PUT vs PATCH, idempotency; API versioning | A PATCH status endpoint and a v1 route group | PATCH changes only the status; a test proves PUT is idempotent |

**✅ Checkpoint (Fri, no docs):** Explain when SQL actually runs for an IQueryable, then add a sort parameter without docs

#### Week 5 · Assignment 5: Authentication & authorization
**🎯 Objective:** Know who is calling and what they may do: Identity, JWTs, refresh tokens, policies and sign-in with Microsoft Entra ID.
**🪜 Level:** Intermediate
**📦 Deliverable:** PR "Auth" merged: register/login, JWT + refresh tokens, per-user data, an admin policy, Microsoft sign-in.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Authentication vs authorization; claims and ClaimsPrincipal; ASP.NET Core Identity | Identity with register and login endpoints and password rules | Passwords are hashed; a duplicate email returns 409 |
| Tue | JWT bearer tokens: structure, signing, validation parameters | Issue access tokens and protect the API with [Authorize] | No token → 401; a tampered token is rejected |
| Wed | Refresh tokens: rotation and revocation | Refresh-token table, rotate on every use, revoke on logout | Reusing an old refresh token fails |
| Thu | Role- and policy-based authorization; resource-based checks; EF global query filters | An Admin policy; users only see their own applications | A test proves user A can't read user B's data |
| Fri | OAuth 2.0 and OpenID Connect; Microsoft Entra ID app registrations and scopes | "Sign in with Microsoft" via Entra ID, mapped to a local user | A Microsoft login ends with a JobHunt JWT |

**✅ Checkpoint (Fri, no docs):** Draw how a JWT becomes a ClaimsPrincipal and how [Authorize] decides, from memory

#### Week 6 · Assignment 6: Testing
**🎯 Objective:** Trust every change: unit tests with fakes, integration tests over HTTP, and tests against a real database.
**🪜 Level:** Intermediate
**📦 Deliverable:** PR "Tests" merged: unit + integration + real-database tests, an auth test helper, coverage ≥ 80% enforced.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | The test pyramid; unit tests with fakes and mocks (NSubstitute or Moq) | Service-layer unit tests with mocked repositories | Every service rule has a test |
| Tue | Integration tests with WebApplicationFactory | HTTP tests for the API in memory: status codes and JSON | 400, 401, 403 and 404 paths are all covered |
| Wed | Testing against a real database: Testcontainers for SQL Server, test data builders | Integration tests on a SQL Server container | Migrations run in the test; tests don't depend on each other |
| Thu | Testing authenticated endpoints with a test auth handler or test tokens | An authenticated test client helper | Tests run as different users and roles |
| Fri | Coverage with coverlet + ReportGenerator; a coverage gate | Coverage report and an 80% threshold | `dotnet test` fails when coverage drops below 80% |

**✅ Checkpoint (Fri, no docs):** Write an integration test for a 404 case from scratch

#### Week 7 · Assignment 7: Database performance
**🎯 Objective:** Make the data layer fast and correct under load: no N+1 queries, the right indexes, transactions and concurrency control.
**🪜 Level:** Intermediate
**📦 Deliverable:** PR "DB performance" merged, with before/after SQL and query counts in the description.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | How EF Core builds SQL: logging the generated SQL; the N+1 problem | Find and fix an N+1 in the applications list (Include vs projection) | The logged query count drops |
| Tue | Tracking vs AsNoTracking; projections to DTOs; split queries | Read endpoints use AsNoTracking + Select projections | The SQL fetches only the needed columns |
| Wed | Indexes: clustered vs non-clustered, covering indexes, execution plans | Indexes for the status, company and user filters | The execution plan shows an index seek |
| Thu | Transactions: SaveChanges as a transaction, explicit transactions, isolation levels | Change status + write history in one transaction | A failure in step 2 rolls back step 1 (test) |
| Fri | Concurrency: optimistic (rowversion) vs pessimistic; DbUpdateConcurrencyException | A RowVersion on JobApplication; conflicting updates return 409 | Two simultaneous edits: the second one gets 409 |

**✅ Checkpoint (Fri, no docs):** Explain the N+1 problem and fix one live

#### Week 8 · Assignment 8: Caching & rate limiting
**🎯 Objective:** Serve repeated reads fast without serving stale or someone else's data, and protect the API from overload.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Caching + rate limiting" merged: memory + Redis + output caching with invalidation, partitioned rate limits.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Caching basics: what, where, how long; IMemoryCache and expirations | Cache company lookups in memory | The second call is served from the cache (logged) |
| Tue | Distributed caching with Redis in Docker; IDistributedCache; serialization | Redis cache for the stats endpoint | The cache is shared by two running API instances |
| Wed | Output caching; invalidation (tags, eviction on writes); when caching is wrong | Output cache for public endpoints, evicted on updates | Updates show immediately and no user sees another user's data |
| Thu | The rate limiting middleware: fixed window, sliding window, token bucket, concurrency | A global limiter plus per-endpoint policies | A burst beyond the limit gets 429 |
| Fri | Partitioned limits per user and per IP; Retry-After; custom rejection responses | Per-user limits when signed in, per-IP when anonymous | 429 includes Retry-After and other users are unaffected |

**✅ Checkpoint (Fri, no docs):** Explain one case where output caching would leak another user's data

#### Week 9 · Assignment 9: Resilience & background jobs
**🎯 Objective:** Survive failing dependencies and move slow work out of the request: retries, timeouts, circuit breakers, queues and scheduled jobs.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Resilience + jobs" merged: a resilient typed HttpClient, an in-process queue worker, a recurring job.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | IHttpClientFactory and typed clients; why `new HttpClient()` is a trap | A typed client for an external API (e.g. a public holidays or company-info API) | The client comes from the factory with a timeout set |
| Tue | Transient faults: retries with backoff and jitter, timeouts (Microsoft.Extensions.Http.Resilience / Polly) | The standard resilience handler on the typed client | Simulated 503s are retried and then succeed |
| Wed | Circuit breakers and fallbacks | A breaker that opens after repeated failures, with a fallback answer | The breaker opens and closes (logged) and the API stays responsive |
| Thu | Background work: BackgroundService and Channels as an in-process queue | Queue "send follow-up reminder" jobs for a worker | The request returns at once and the worker processes the job |
| Fri | Scheduled, persistent jobs with Hangfire (or Quartz): recurring jobs, retries, dashboard | A daily job that flags applications with no reply after 7 days | It runs on schedule and shows in the dashboard |

**✅ Checkpoint (Fri, no docs):** Explain retry vs circuit breaker, and why retries need idempotent operations

#### Week 10 · Assignment 10: Logging & monitoring
**🎯 Objective:** See what the system is doing in production: structured logs, distributed traces, metrics and health checks.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Observability" merged: Serilog, correlation ids, OpenTelemetry traces, health checks, Application Insights wiring.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Structured logging: ILogger, levels, message templates, scopes; Serilog | Serilog with console and file sinks + request logging | Logs are JSON with properties, not plain strings |
| Tue | Correlation ids and enrichers; what never to log (secrets, personal data) | A correlation id that flows through logs and outgoing calls | One request's logs can be filtered by its id |
| Wed | OpenTelemetry: traces, spans and metrics | OTel for ASP.NET Core, EF Core and HttpClient into the Aspire dashboard (or Jaeger) | One request shows spans for API → database → external call |
| Thu | Health checks: liveness vs readiness; checking the database and Redis | /health/live and /health/ready with dependency checks | Ready fails when the database is down; live doesn't |
| Fri | Application Insights / Azure Monitor: requests, dependencies, alerts | App Insights wired through configuration | Telemetry is visible (or exported locally without Azure) |

**✅ Checkpoint (Fri, no docs):** From one trace, explain where the time went

#### Week 11 · Assignment 11: Messaging
**🎯 Objective:** Let services talk without waiting on each other: events through a broker, a worker that consumes them, and delivery you can rely on.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Messaging" merged: event contracts, RabbitMQ (or Azure Service Bus) publishing, a notifications worker, outbox + idempotency.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Why messaging: sync vs async, queues vs topics, at-least-once delivery | Event contracts: ApplicationStatusChanged, InterviewScheduled | Contracts live in a shared project |
| Tue | RabbitMQ basics in Docker: exchanges, queues, bindings (or Azure Service Bus) | The API publishes ApplicationStatusChanged | The message shows in the RabbitMQ management UI |
| Wed | Consumers as worker services: acknowledgements, retries, dead-letter queues | A notifications worker that consumes the events | A poison message ends in the dead-letter queue |
| Thu | The outbox pattern: publishing reliably with the database | An outbox table + a background publisher | No event is lost when the broker is down during a save |
| Fri | Idempotent consumers; MassTransit as a higher-level option | An idempotency table in the worker | A duplicate message is processed only once |

**✅ Checkpoint (Fri, no docs):** Explain the outbox pattern and an idempotent consumer with a diagram

#### Week 12 · Assignment 12: Security hardening
**🎯 Objective:** Close the common holes before shipping: the OWASP API risks, injection, CORS, security headers and secrets.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Security" merged: an OWASP checklist with fixes, CORS + headers, secrets out of the repo, no vulnerable packages.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | OWASP API Security Top 10: broken object-level authorization, broken authentication, and the rest | A security review of JobHunt against the list | A findings list with a fix for each |
| Tue | Input validation, SQL injection with raw SQL (FromSql parameters), mass assignment | Fix risky raw queries; DTO allow-lists for updates | Tests prove injection payloads and extra fields fail |
| Wed | CORS done right; HTTPS, HSTS and security headers | A CORS policy for the React app's origin + a headers middleware | Other origins are blocked and the headers are present |
| Thu | Secrets: user-secrets, environment variables, Azure Key Vault | Move the JWT key and connection strings out of appsettings | `git grep` finds no secret in the repo |
| Fri | Dependency auditing (NuGet audit); least-privilege database users | Audit packages; run with a minimal-rights database login | No known vulnerable packages and the app works with the restricted login |

**✅ Checkpoint (Fri, no docs):** Name five OWASP API risks and where JobHunt guards against each

#### Week 13 · Assignment 13: Deployment & scaling
**🎯 Objective:** Ship it like a team would: containers, one-command local environment, CI/CD and a stateless API that scales out.
**🪜 Level:** Advanced
**📦 Deliverable:** PR "Ship it" merged: Dockerfiles, docker compose, GitHub Actions CI/CD, a deployed (or documented) environment, a scale-out test.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Docker for .NET: multi-stage builds, small images, running as non-root | Dockerfiles for the API and the worker | The image is under 250 MB and runs as non-root |
| Tue | docker compose for the whole local environment | compose up runs API, worker, SQL Server, Redis and RabbitMQ | One command starts everything |
| Wed | CI with GitHub Actions: restore, build, test, coverage | A CI pipeline on every pull request | PRs show green checks with coverage |
| Thu | CD to Azure App Service (or Container Apps): deployment slots, configuration | A deploy pipeline on merges to main | A merge deploys (or the dry run is documented step by step) |
| Fri | Scaling: stateless APIs, scale out vs up, what Redis and the outbox make possible | Run two instances; check caching, rate limits and jobs still behave | A load test shows both instances serving correctly |

**✅ Checkpoint (Fri, no docs):** Explain why the API must be stateless to scale out, with JobHunt examples

#### Week 14 · Assignment 14: Capstone & interview story
**🎯 Objective:** Turn JobHunt into a portfolio piece you can defend in a 20 LPA interview.
**🪜 Level:** Wrap-up
**📦 Deliverable:** Release v1.0: architecture tests, README with diagrams and decision records, a load-test result, a demo script and your pitch.
| Day | 📖 Learn | 🛠 Build | ✓ Done when |
|---|---|---|---|
| Mon | Clean Architecture: the dependency rule and where each concern lives | A refactor pass on the weakest layer + architecture tests (NetArchTest) | The architecture tests pass |
| Tue | Documenting a backend: README, architecture and ER diagrams, decision records (ADRs) | README with diagrams + 3 ADRs | A newcomer can run it in 10 minutes |
| Wed | Load testing with k6 (or Bombardier); reading p95 latency | A load test + one performance fix | p95 recorded before and after the fix |
| Thu | `.http` files and Postman collections as living API docs; demo data | A demo script and collection | A 5-minute demo runs end to end |
| Fri | Telling the story: trade-offs, failures, what you'd change | 3 resume bullets + a 2-minute architecture pitch | The pitch is recorded |

**✅ Checkpoint (Fri, no docs):** Whiteboard the full JobHunt architecture in 10 minutes

### Project 2: JobHunt Web (React + TypeScript + Vite), Weeks 15–21, consuming Project 1 (the .NET API)
**React roadmap:** components + TypeScript → routing → server state → forms → advanced patterns → styling + a11y → testing + performance → shipping.
#### Week 15 · Setup
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | React's mental model: components, JSX, props, rendering; Vite project layout | Vite React TS; feature-based folders |
| Tue | State and events; typing props/state/events in TypeScript | TypeScript in React: props, state, events; layout + nav |
| Wed | React Router: routes, nested layouts, params, 404s | React Router: Login, Dashboard, Applications, Detail, 404 |
| Thu | Data fetching basics; why useEffect fetching gets messy; typed API client | Typed API client with a base URL |
| Fri | Controlled forms; auth flow and protected routes | Login/Register forms; token storage; ProtectedRoute |

**✅ Checkpoint (Fri, no docs):** Blank Vite app: a typed component with props + state + a route in 20 minutes, no docs

#### Week 16 · Data
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Server state vs client state; TanStack Query (queries, keys, caching) | TanStack Query list with loading and error states |
| Tue | The URL as state: search params for filters and paging | Filters + paging synced to URL search params |
| Wed | React Hook Form + Zod schemas for validation | Create/Edit form: React Hook Form + Zod |
| Thu | Mutations, optimistic updates, cache invalidation | Mutations: optimistic updates + cache invalidation |
| Fri | Error boundaries, toasts, loading states | Toasts + an error boundary |

**✅ Checkpoint (Fri, no docs):** Write a useQuery + useMutation pair from memory, with cache invalidation

#### Week 17 · Features
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Lists and keys; composing a board from columns and cards | Kanban board by status |
| Tue | Drag and drop with dnd-kit, including keyboard accessibility | Drag-and-drop (dnd-kit) → PATCH status |
| Wed | Component composition: children, render props, compound components | Detail page: interview timeline + notes |
| Thu | Fetch/axios interceptors; refreshing tokens on 401 | Token refresh on 401 |
| Fri | Context API: when it's right and when it causes re-renders | Auth context + logout |

**✅ Checkpoint (Fri, no docs):** Explain when Context causes re-renders, and one alternative

#### Week 18 · Dashboard & UX
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Derived state: compute, don't store; dashboard stats | Stats cards |
| Tue | Charts with Recharts: choosing the right chart | Charts (Recharts): weekly applications, status funnel |
| Wed | Responsive CSS: flexbox, grid, media queries, mobile-first | Responsive layout + mobile nav |
| Thu | Theming with CSS custom properties; dark mode | Dark mode with CSS variables |
| Fri | Accessibility basics: semantic HTML, labels, focus, contrast | Accessibility pass: labels, keyboard, focus |

**✅ Checkpoint (Fri, no docs):** Build a 2-column → 1-column responsive layout with CSS grid from memory

#### Week 19 · Quality
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Testing philosophy: test behaviour, not implementation (React Testing Library) | Vitest + React Testing Library setup |
| Tue | user-event: simulating real typing and clicks; form tests | Test form validation and submit |
| Wed | Mock Service Worker (MSW) for API mocking | MSW mocks; test list loading/error/empty states |
| Thu | Performance: why components re-render; memo, useMemo, lazy routes | Profiler, lazy routes, justified memoisation |
| Fri | Custom hooks: extracting reusable logic | Custom hooks: useDebounce, useAuth |

**✅ Checkpoint (Fri, no docs):** Write an RTL test for a button that shows a loading state, from scratch

#### Week 20 · Polish
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Debouncing and throttling user input | Debounced search |
| Tue | File uploads from the browser (FormData, progress) | Resume upload UI |
| Wed | CSV parsing and generation in the browser | CSV import/export UI |
| Thu | Loading UX: skeletons, empty states, error states | Empty states + skeleton loaders |
| Fri | Buffer: revisit your weakest React topic | Buffer |

**✅ Checkpoint (Fri, no docs):** Write a useDebounce hook from memory

#### Week 21 · Ship
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Environment variables and production builds in Vite | Production env config + build |
| Tue | Deploying an SPA (Vercel/Netlify), routing fallbacks, CORS | Deploy (Vercel/Netlify free) + CORS to the API |
| Wed | End-to-end testing with Playwright | Playwright smoke test: login → create → move on the board |
| Thu | A README that sells: screenshots, GIF, architecture, setup | README with screenshots/GIF |
| Fri | Presenting your project in 2 minutes | 2-minute demo video |

**✅ Checkpoint (Fri, no docs):** Record a 2-minute JobHunt Web walkthrough + architecture

### Week 22: Portfolio wrap-up
Mon: pin the 3 repos and write a GitHub profile README · Tue: resume project bullets · Wed: a 2-minute explanation of each project (architecture, trade-offs, what you'd improve) · Thu: practise explaining one project mock-interview style · Fri: rest

### Project 3: SnippetVault API (Node.js + Express + MongoDB), Weeks 23–28 (after the 5-month plan)
**Node.js roadmap:** runtime → Express → REST → data → auth → testing → real-time → shipping.
*Save, tag, search and share code snippets. Teaches REST, data modelling, auth, testing, and real-time features.*

#### Week 23 · Setup
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Node runtime, CommonJS vs ES modules, npm + package.json scripts | Init repo, npm, folder structure (routes/controllers/models/middleware), ESLint + Prettier, .env |
| Tue | The `http` module, request/response cycle, event loop basics | Raw `http` server with no Express (understand req/res), then switch to Express |
| Wed | Express routing and the middleware chain (`next()`, order matters) | Health route, JSON body parsing, 404 + error-handling middleware |
| Thu | REST design: resources, HTTP verbs, status codes (200/201/204/400/404) | In-memory CRUD for snippets with correct status codes |
| Fri | async/await errors in Express; Postman collections and environments | Test every route in Postman/Thunder Client; commit the collection + a README skeleton |

**✅ Checkpoint (Fri, no docs):** From a blank folder: an Express server with GET/POST `/notes` (in memory) + 404 + error middleware in 20 minutes

#### Week 24 · Database
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Documents vs tables: when MongoDB fits; connection strings and config | Connect Mongoose (local MongoDB or Atlas free tier); config module |
| Tue | Mongoose schemas, models, built-in validation, timestamps | Snippet schema (title, code, language, tags, timestamps) with validation; replace the in-memory store |
| Wed | Querying: filters, text indexes, pagination with skip/limit + sort | Filter by language/tag, text search, pagination, sorting |
| Thu | Validating input at the boundary with Zod; a consistent error shape | Request validation middleware (Zod); a consistent error response shape |
| Fri | Layered architecture: route → controller → service → model | Refactor into a service layer + async error wrapper |

**✅ Checkpoint (Fri, no docs):** Explain out loud: schema vs model, and why pagination needs a sort. Then add a `?limit=` cap (max 50) without looking anything up

#### Week 25 · Auth
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Password hashing: bcrypt, salts, cost factor (never store plain text) | User model, bcrypt hashing, register endpoint |
| Tue | JWT anatomy (header.payload.signature), stateless auth, expiry | Login → JWT; auth middleware |
| Wed | Authentication vs authorization; 401 vs 403 | Ownership: only the owner can edit/delete (403) |
| Thu | Cookies: httpOnly, Secure, SameSite; refresh-token flow | Refresh token in an httpOnly cookie + logout |
| Fri | OWASP basics: helmet headers, CORS, rate limiting, brute-force protection | Security: helmet, CORS config, rate limiting on auth routes |

**✅ Checkpoint (Fri, no docs):** Draw the login → JWT → protected-route flow from memory; explain 401 vs 403 and where the refresh token lives

#### Week 26 · Features
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Slugs and unique indexes | Public/private snippets; share via slug |
| Tue | Embedding vs referencing; `populate` and its cost | Collections (folders): refs + populate |
| Wed | The aggregation pipeline: $match, $group, $sort, $limit | Aggregation pipeline: top tags, snippets per language |
| Thu | Structured logging, log levels, request IDs for tracing | Structured logging (pino) + request IDs |
| Fri | OpenAPI: describing an API so others can use it | OpenAPI/Swagger docs |

**✅ Checkpoint (Fri, no docs):** Write an aggregation pipeline from memory: snippet count per tag, top 5

#### Week 27 · Testing + real-time
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | The testing pyramid; Jest basics (describe/it/expect, setup/teardown) | Jest + Supertest + mongodb-memory-server setup |
| Tue | Integration tests over HTTP with Supertest | Tests for the auth flows |
| Wed | Test isolation: fresh data per test, mocks vs real dependencies | Tests for CRUD + permissions |
| Thu | WebSockets vs HTTP; Socket.IO events and rooms | Socket.IO: live notification when someone favourites your snippet |
| Fri | Caching: LRU, TTL, cache invalidation, measuring before optimising | In-memory LRU cache for a hot query; measure before and after |

**✅ Checkpoint (Fri, no docs):** Write a new Supertest test for a 403 case without copying an existing test

#### Week 28 · Ship
| Day | 📖 Learn | 🛠 Build |
|---|---|---|
| Mon | Docker: images vs containers, Dockerfile layers, docker-compose | Dockerfile + docker-compose (API + Mongo) |
| Tue | CI: what a pipeline runs and why (lint → test → build) | GitHub Actions CI: lint + tests |
| Wed | 12-factor config: env vars per environment, no secrets in git | Deploy to a free tier, or record a demo |
| Thu | Documenting a project: README structure, architecture diagrams | README: features, architecture diagram, API table |
| Fri | Telling your project story in interviews (problem → design → trade-offs → result) | Retro + 3 resume bullets with numbers |

**✅ Checkpoint (Fri, no docs):** Record a 2-minute explanation of SnippetVault's architecture on your phone

