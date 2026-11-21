# First release browser attempt (not acceptance)

Run 44876690944 tested deployed main 047986c4753e45b3fe77af726a7fbf96686b13a9.
Both rounds had no observed axe, console or HTTP errors, but could not complete
/world because the harness read an old response body after explicitly reloading
that page. One navigation-aborted request was also counted without classifying
its cause. This run is **not** two clean audits. The harness now reads the body
before navigation and classifies ERR_ABORTED as expected only during explicit
navigation/context teardown. Other failed requests remain failures.

A separate code review also corrected monitoring for the bounded initial gold
accumulation period; two fresh full rounds are required after that deployment.
