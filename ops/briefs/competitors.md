# Competitive Landscape — Toronto Tennis Training

Reference for copy, pricing and positioning decisions. Updated from a look at rivals' public pages on 2026-11-16: nothing was submitted and no checkout was opened. Prices are CAD per player, with tax as each page states it. "Browser" rows were read in a browser; "summary" rows come from a page summary and were not re-read.

## Group class prices, per hour

| Who | What | Per hour | Paid up front | Read by |
|---|---|---|---|---|
| Nike tennis lessons at Crescent School, North York | indoor, Sundays, 60 min, 5 weeks, max 6 per court, juniors and adults | $75 + HST | $375 + HST, plus $35 a year | browser |
| Toronto Tennis City (home of ACE), midtown | winter term (Jan 4 – May 2, 2027), 16 weeks, juniors 8–17, 1 to 2 h a class | about $43–48 + HST | $734–$1,534 + HST | browser |
| Toronto Tennis City | the same term, juniors 5–7, 60 min | about $32–34 + HST | $505–$539 + HST | browser |
| Toronto Xanadu Tennis, North York | indoor, 10 weeks, adults only, max 4 to 8 | $30–$41 (tax not stated) | $450–$821 | browser |
| Toronto Tennis City, adults (members only) | clinics, length mostly not stated | $37 a clinic and up (tax not stated) | per clinic | browser |
| Bayview Village Tennis Camp, North York | outdoor only; juniors 2 h × 6 weeks; adults 1 h × 8 weeks, 4 a group | juniors $31, adults $40 (tax in) | $375 / $320, plus $50–55 membership | summary |
| MC Academy of Tennis, Etobicoke and Forest Hill | club courts, no indoor class shown; adults in groups of 3 or 4 | juniors $20, adults $30–35 (tax in) | not shown | summary |

Not a group class, for reference (summary): ACE's high-performance streams at Davisville (2025/26, 40 weeks, juniors) cost $4,680–$14,520 + HST, with instalment plans. Little Aces (ages 5–7, about 90 minutes three times a week) works out to about $26 an hour + HST if every week runs; holiday closures make the real figure higher.

## How a new player joins and pays

- **Pick a class, then pay.** Everyone who sells online works this way. Nike lists each time slot with a Register or Join Waitlist button, asks for a skill level (1.0–3.5) at checkout and regroups players on arrival. Xanadu: choose a class in its booking system (Acuity) and pay in full; spots update live. Toronto Tennis City juniors: choose a day and time in the member portal (ClubInterConnect) and pay in full at registration.
- **A level check only for higher levels.** Toronto Tennis City asks a new child for Progressive 2, Progressive 3 or the High School Team to email for approval first. Xanadu requires a self-assessment before intermediate and advanced classes, and no level change after the start. ACE holds tryouts for some streams and keeps a waitlist for its Performance Stream. None of the rivals checked sends a beginner through a quiz or a coach placement first.
- **Paid in full online.** Xanadu holds a spot only once it is paid. ACE offers instalments.
- **Membership first at some.** Toronto Tennis City's adult programs are for members only (log in to register). Bayview sells its membership first, then enrols online on its own enrolment site, where the family picks a program and weekday group and the day is confirmed by email.
- **Other systems.** MC Academy: a CourtReserve portal for programs, Calendly for adult and private lessons. TAC Sports: the Amilia store, with a log-in at checkout. NYTA: an online application form per program, then contact by email or phone.
- **What a listing shows:** day and time, ages or level, dates and price; some show spots left, sold out or a waitlist. Group size is stated where it is small: Nike max 6 per court, Xanadu max 4, 6 or 8, Bayview 4 to 6 per coach, TAC Sports 1 coach to 4. Most others do not say.

## Commitment

5 weeks (Nike) · 6 (Bayview juniors) · 8 (Bayview adults) · 10 (Xanadu) · 16 (Toronto Tennis City juniors) · 40 (ACE streams).

## Refunds and missed classes

- **Toronto Tennis City:** cancel at least two weeks before the start, with a $35 fee; missed sessions are not reimbursed.
- **ACE:** cancel at least two weeks before the first day, with a $35 fee.
- **Xanadu:** no make-up, credit, transfer, rescheduling or refund for a missed class; a full refund only if the class does not run (it needs about four players).
- **Bayview:** a full refund if cancelled up to two weeks before the program starts.
- **MC Academy:** programs are refunded as credit that does not expire; a card refund on request with at least 7 days' notice; nothing under 24 hours.
- **TAC Sports:** credits only, at most one a season, with 24 hours' notice.
- **Nike:** no refund rule shown.

## Extra fees

- **Nike:** a $35 registration fee per player per year.
- **Bayview:** membership, $55 for juniors and $50 for adult lessons only (HST in); its FAQ also shows $150 for juniors, so the page disagrees with itself.
- **Toronto Tennis City:** adult membership required (amount not read); the $35 cancellation fee (ACE charges the same).
- **Xanadu:** no membership; $5 per racquet per class if rented.
- **MC Academy:** none listed.

## Not found

- **NYTA Junior Academy** (North York, winter in climate-controlled bubbles at three locations): prices sit in PDF flyers that were not opened.
- **Top Tennis Academy** (North York): only a directory page, every program "on request"; no own site found.
- **TAC Sports:** the class list did not load, so no times, ages or prices.
- **Toronto Tennis Academy:** the site could not be read.
- Group size at Toronto Tennis City, and whether its winter classes are indoors; Xanadu's tax; whether Bayview or MC Academy run anything indoors.

## Our line (`src/content/programs.ts`)

- $35 a session (`SESSION_PRICE`); $210 per six-week cohort of 6 classes (`COHORT_WEEKS`; a group card reads "$210 for 6 classes over six weeks"). A block the coach opens in `/admin/cohorts` carries its own price.
- Three programs: Youth Bootcamps (ages 7–17), Adult Bootcamps (16 and up) and Private Lessons ("Rates on request").
- Up to 8 players a group (`GROUP_MAX_PLAYERS`). Each group has one level tag. Every class slot in the planned lineup is an hour; the site states no general class length.
- Pick the group that fits your age and level; your coach confirms the level on court in week one. If another group fits better, the player moves at the same price; if none does, a full refund (`RIGHT_GROUP_PROMISE`). The High Performance Youth Bootcamp is by approval.
- The 20-minute assessment is optional: $20, and it comes off the price when the player enrolls afterward.
- Every group trains at Newtonbrook Tennis Club, North York.

## Pages read (2026-11-16)

- Nike at Crescent School: https://www.sportscampscanada.com/camps/nike-tennis-camp-toronto
- Toronto Tennis City: https://torontotenniscity.com/junior-programs/learn-to-play-programs/ · https://torontotenniscity.com/adult-programs/ · https://torontotenniscity.com/adult-membership/
- ACE Tennis: https://ace-allcanadianenterprises.ca/acedavisvilletoronto · https://ace-allcanadianenterprises.ca/
- Toronto Xanadu Tennis: https://www.torontoxanadutennis.com/winter-adult-tennis-classes · https://www.torontoxanadutennis.com/u14-junior-tennis
- Bayview Village Tennis Camp: https://bayviewvillagetenniscamp.com/fall-junior-program/ · https://bayviewvillagetenniscamp.com/adult-group-lessons/ · https://bayviewvillagetenniscamp.com/memberships/
- MC Academy of Tennis: https://www.mcacademyoftennis.com/mtc-fall-afterschool · https://www.mcacademyoftennis.com/adult-lessons · https://www.mcacademyoftennis.com/cancellation-general
- NYTA Junior Academy: https://www.nyta.org/jr-program.html · https://www.nyta.org/winter-program.html · https://www.nyta.org/registration-contacts.html
- Top Tennis Academy (directory): https://tennisacademy.app/academy/top-tennis-academy-toronto
- TAC Sports: https://tacsports.ca/tennis/ · https://tacsports.ca/weekly-programs · https://app.amilia.com/store/en/toronto-athletic-camps-tac-sports/shop/programs
- Toronto Tennis Academy: https://torontotennisacademy.com (could not be read)
