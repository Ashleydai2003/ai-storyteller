AI BOTC Storyteller
- Kahoot like web interface with random code to join room/game and ability to play as guest with out login system (can implement later but no need for now)

- Key challenge: host reveals no information to any player
- Will need to set host up on a computer (generates room code)
- each player then joins the room on their phone and selects a name 

- Any part that can be deterministic should be deterministic, the AI should only handle the creative story telling elements 

- Game rules should be in an md file/prompt 


Implementation Flow:
- Start with implementing based off trouble brewing rules
- when user first navigates to the webapp, there should be two buttons: create a room and join a room 
- Clicking create a room will generate all necessary state for new game and generate a unique code to identify the room or users to join, show waiting room with start game button (disabled unless enough players which is 6 or more)
- Clicking join a room will prompt user to enter room code, this will find the room and then prompt the user for a name (kahoot style)
- Once all players are in, clicking start game will trigger backend setup: first generate a "bag" of random characters according to rule on distrubition and how many palyers there are (key caveats: if drunk is selected as outsider, we need to select another townsfolk character to assign as the drunk)
- The assign the players their characters, this will be linked to their names 
- Each palyer on their own phones will now see what character they were assigned (caveat: drunk player does not get shown drunk, they get shown the character that was picked to be drunk)
    - Implementation hint: drunk should be kept as a state, same as poinsoned 
- At this point, host screen should show "review and arrange your characters" and a continue button 
    - allow users to grad their names in a circle for seating arrangement (important for game state)
- Once the continue button is pressed, necessary start state is generated and the game continues with the first night 
    - Necessary start state include: 3 demon bluffs, red herring if there is a fortune teller, etc. 
    - Also save seating arrangement
- the screen will show: Night time (please look only at your own phone)



Second part of implementation:
- Backend should keep track of what night it is and show it on the screen (also so first night characters dont get woken up again)
- Go in night order, wake each player up by showing on their phone screen: wake up! followed by a prompt based of the two possibilities:
    - One: the character is being told some thing (eg. {player name} is the demon, these character are not in play, etc.)
        - This information will be shown on the user's phone with a got it button
        - Caveat: for the spy, show entire game state in an organized way
        - Caveat: for the empath, generate the information based off the game's state
    - Two: there is an action the player needs to take (eg. select someone to kill, select two people)
        - show users the possible people they can select (including themselves) in the seating arrangement with a confirmation (continue) button
            - be sure to add validation, like validate that the user selected the right number of people
        - If no follow up information just show "go back to sleep" but record state updates in the backend 
        - If follow up information: generate the info based off user's choice and game state and show user the info with continue button 
    - If a player is poisoned or drunk they should be shown incorrect information (randomly generate between all possible answers)
    - Once all characters have gone, wake everyone up by showing Day time on host screen (with sound effect)
    - Note: all state is updated immediately


Third part of implementation:
- During the day time, there should be a timer (5 mins) and "Individual conversation time" shown on host screen as well as a start nominations and extend time button  
- once time runs out or start nominations button is pressed, a 5 min timer is started and 
- Simultaneous Each player on their phone should be shown all the names (in seating order) to nominate (this should be press select, press unselecte with nominate button)
    - Each alive player can only nominate once per day and each player can only be nominated once per day (players that cannot be nominated should have greyed out button and players that cannot nominate should be shown no nomination button but still the seating arrangement with nominability)
- If a nomination is triggered, it shows on screen ({player name} nominated {player name}) with a 5 min timer shown on the host screen with a vote and extend time button
    - When the timer runs out or when vote button is pressed, on the screen it will show "{player name} Voting" (start with player to the right of the player nominated) also show on screen _ more votes needed to put {nominated player name} on the block (it should total to ceiling{half the number of alive players rounded up and number of votes current player on the block has +1})
        - At the same time, on that player's phone there will be a yes and no button on a 10 second timer, if no choice by the end of 10 seconds, default to a no vote 
        - This will go in a circle for eligible voting players until all players have voted 
        - Each player's voting result will be shown on the host screen
        - The dead can vote but only once the entire game (keep track of and check state)
    - At the end of voting, update who is on the block if necessary
- 5 min timer restarts with "nominations open" and {player name or no one} is on the block should be shown on the host screen with a go to night and extend time button
    - Caveat: if two players are tied in votes, show ___ and ____ are tied, no one is on the block on host screen instead
- Once the timer runs out or go to night button is pressed, execute anyone on the block (announce on host screen) and then show Night time (please look only at your own phone)

- repeat night and day logic until either only 3 players are left with the Imp being one of them, Imp is executed, or another ending condition is met 

Final implementation steps:
- Keep track of transcript of what actually happens every day and night (log every action), summarize with AI at the end
- Special abilities:
    - If imp kills himself, random minion gets reassigned imp (starpass) and the game continues 
    - If imp is executed but there is a scarlet women, scarlet women becomes imp
    - If a virgin is nominated by a townsfolk, townsfolk dies immediately (announce this on host screen)
        - If either the virgin or the twonsfolk is drunk or poisoned, nothing happens 
    - Monk selects someone to protect, this protection will be kept as state
    - Soilder is just a character that has perminate protected state unless drunk or poisoned 
    - If the imp chooses to kill the mayor, randomly decide between killing the major and killing someone else, if killing someone else is selected, then randomly select an alive player to kill instead 
    - Curing the day, in addition to nomination options, the slayer has an additional button (slay) that can only be used once 
        - If the slayer decides to slay the imp, imp dies immediately but if slayer is drunk or poisoned, nothing happens 
        - Once used, the slay button will not show up anymore 
    - If a mayor is present in the game and alive, note that there is an additional ending condition
    - Minions are drawn first, if baron is drawn, change game composition 


In general, ensure we cover all rules and edge cases from botc, full rules here: 


Player schema should look like:
Name: player's name 
Character: the chracter the player thinks they are 
Character type: townsfolk||imp||minion||outsider
Chracter registration: townsfolk||imp||minion||outsider
state (list): drunk||poisoned||protected
Ability: true 
Able to nominate: true/false (resets to true at the start of every day unless dead)
Able to be nominated: true/false (resets to true at the start of every day)
Alive: true/false 
Dead voted: true/false
etc.


Game state should look something like this:
Seating order: ordered list 
Fortune teller red herring: player 
Demon bluffs: 3 townsfolk/outsider characters
Number of characters:
Round number: int
Number of alive characters: int 
Players on the block: list (if more then 1 then its tied)
Day: true false (to track what phase of game we're in)
Game Join code:
etc. 

Consider storing players in a circular linked list for seating order, oopen to suggestions to make game flow better and code more elegant. Stop and get feedback between each implementation phase, host on localhost for now (but consider for future hosting on vercel)

Where AI can be creative:
- Rearranging characters based on seating arrangement 
- Assigning the drunk 
- Picking which two chracters to show to first night characters 
- Deciding whether kill bounes off mayor or not and who it bounces off to
- Drunk/poisoned information
- Picking the red herring for fortune teller 
- How each player died (storytelling florish)