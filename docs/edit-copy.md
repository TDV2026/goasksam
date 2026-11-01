# Editing the words on GoAskSam

The plain words on the main pages live in one file: **data/copy.json**. You can change a line in the GitHub web editor. No developer is needed, and nothing has to be rebuilt by hand.

## Where the file is

On GitHub, open the goasksam repository, then the folder **data**, then **copy.json**.

The file is grouped by page. Each line looks like this:

    "TITLE": "About GoAskSam",

The name on the left (TITLE) says which slot it is. The words on the right, inside the quote marks, are what the page shows. Change only the words on the right.

## How to change a line

1. Open **data/copy.json** on GitHub and click the pencil icon (Edit this file).
2. Find the page (for example `about`) and the line you want. Use Ctrl+F (Cmd+F on a Mac) to search for a few of the current words.
3. Change the words between the quote marks. Keep the quote marks, and keep the comma at the end of the line.
4. Click **Commit changes**. Choose **Create a new branch and start a pull request**, not "Commit directly to main". The copy check runs on the pull request and tells you if something is wrong before the change goes live. Merge it when it shows a green tick.
5. The live site shows the new words after the next deploy.

## What the check will say if something is wrong

The check names the line and says why, in plain words. For example:

- `about.WHAT has a dash.` Use a comma, a period or the word instead of a long dash.
- `about.TITLE is a page title of 83 characters. Titles must be under 60.`
- `about.DESC is a meta description of 170 characters. Descriptions must be under 160.`
- `feedback.SEND is empty.` A line cannot be blank.
- `about.WHAT names a competitor.` Public copy names no competitors.
- `about.WHAT gives a count of sources or auction houses.` No numbers of sources.
- `about.WHAT uses "our data" or "valuation".` Say what the sales show instead.
- `about.WHAT speaks as "I" or "my".` Sam is never written in the first person.
- `data/copy.json is not valid JSON.` A comma or a quote mark went missing. Compare with the line above and below.
- `home.ORPHAN is in data/copy.json but no page reads it.` The line does nothing. Remove it.

Two titles were already over the limit when the check began (the Home page title and the Find page title) and so were two descriptions (Home and About). The check lets them stay as they are but will not let them get longer. When you shorten one, tell a developer so it comes off the allowance.

If the check fails, the page does not change until the problem is fixed. Do not merge a red change.

## What is NOT in this file

- Anything the engine writes: range sentences ("typically $22,500 to $41,000"), the "Left out ... " lines, bid lines, the questions Sam asks and their chips. These come from the engine so they always match the numbers.
- Every number, date and car name on a page. Those come from real sales.
- The What's new entries. They are in **data/whatsNew.json**, with their own simple format: a date, the text, and an optional thanks line.
- Words that are still inside the page code and not yet in this file: the Market Check, Sell and Find search screens, the Tasks page, the cards and tiles, the buttons that appear after a search, error and empty-state messages, and the Sam Desk (for business) page. Those need a developer for now.
- The copyright line at the bottom of Home.

## If a page breaks after an edit

Open the **Actions** tab on GitHub, find the red "Copy check" run and read the line that failed. Fix that line, or undo the change with **Revert** on the commit.
