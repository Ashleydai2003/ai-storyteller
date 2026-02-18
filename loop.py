if first night: 
    if num players >= 7:
        wake minion and tell them who their demon is 
        wake demon and tell them who their minions are + show them 3 character bluffs
        if poisoner in play:
            wake poisoner and have them choose a character, update that character's state to poisoned
        if washerwomen in play:
            wake washerwoman and show them their information
        if librarian in play:
            wake librarian and show them their information
        if investigator in play:
            wake investigator and show them their information
        if chef in play:
            wake chef and show them their information
        if empath in play:
            wake empath and show them their information
        if fortune teller in play:
            wake fortune teller, have them select two players and then show them their information
        if butler in play:
            wake butler and have them choose their player, update their state to master
        if spy in play:
            wake spy and show them their information
else:
    if poisoner in play:
        wake poisoner and have them choose a character, update that character's state to poisoned
    if monk in play:
        have them select a player to protect, update that player's state to protected
    if scarlet woman in play and demon died in the last day:
        show them they are now the demon 
    wake demon up and have them choose someone to kill, update their state to dead 
    if ravenskeeper in play and they died tonight:
        wake them up and have them choose a player, then show them the necessary information
    if empath in play:
        wake empath show them their information
    if fortune teller in play:
        wake fortune teller, have them select two players and then show them their information
    if undertaker in play and someone was executed during the last day:
        show them their information 
    if butler in play:
        wake butler and have them choose their player, update their state to master
    if spy in play:
        wake spy and show them their information


each player action/information shown should be their own helper function