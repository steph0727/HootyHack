"""Event categories plus a small labeled corpus that bootstraps the flyer categorizer.

The corpus holds short, flyer-like snippets. Student corrections (category_feedback)
and categories supplied by Owl Life are added to it at training time, so the model
improves as people use the app.
"""

CATEGORIES = {
    "tech": "Tech & Making",
    "academic": "Academic",
    "career": "Career",
    "arts": "Arts & Music",
    "social": "Social",
    "sports": "Sports & Fitness",
    "faith": "Faith & Spirituality",
    "service": "Service",
    "culture": "Culture & Identity",
    "wellness": "Health & Wellness",
    "gaming": "Gaming",
    "leadership": "Leadership",
}

SEED_CORPUS = [
    # tech
    ("hackathon build a project in 24 hours prizes mentors code", ["tech"]),
    ("hack night build and chill bring your laptop side projects", ["tech", "social"]),
    ("intro to python workshop programming for beginners", ["tech", "academic"]),
    ("robotics club build session arduino soldering sensors", ["tech"]),
    ("cybersecurity capture the flag ctf competition", ["tech", "gaming"]),
    ("machine learning ai study group neural networks", ["tech", "academic"]),
    ("3d printing makerspace open lab prototype", ["tech"]),
    ("web development react javascript workshop", ["tech"]),
    ("acm project showcase demos software engineering", ["tech", "career"]),
    ("women in computing panel tech industry", ["tech", "career", "culture"]),
    ("cloud computing aws certification bootcamp", ["tech", "career"]),
    ("app development mobile ios android meetup", ["tech"]),
    # academic
    ("study session exam review tutoring calculus", ["academic"]),
    ("research symposium undergraduate posters presentations", ["academic"]),
    ("guest lecture professor talk history seminar", ["academic"]),
    ("writing center thesis workshop citations", ["academic"]),
    ("honors college book discussion", ["academic", "social"]),
    ("finals week study hall quiet library", ["academic", "wellness"]),
    ("math club problem solving competition", ["academic"]),
    # career
    ("career fair internships employers bring your resume", ["career"]),
    ("resume review linkedin headshots", ["career"]),
    ("networking night alumni professionals", ["career", "social"]),
    ("mock interviews job search tips", ["career"]),
    ("entrepreneurship pitch competition startup founders", ["career", "leadership"]),
    ("information session company recruiting", ["career"]),
    # arts
    ("open mic night poetry music performances", ["arts", "social"]),
    ("art exhibit gallery opening painting", ["arts"]),
    ("theater club auditions play rehearsal", ["arts"]),
    ("jazz ensemble concert band performance", ["arts"]),
    ("film screening movie night discussion", ["arts", "social"]),
    ("photography walk camera club", ["arts"]),
    ("dance team showcase choreography", ["arts", "sports"]),
    ("crochet and craft night paint and sip", ["arts", "social"]),
    # social
    ("game night snacks meet new people", ["social", "gaming"]),
    ("welcome mixer free pizza make friends", ["social"]),
    ("lawn games and snacks hang out meet new people", ["social"]),
    ("trivia night prizes teams", ["social"]),
    ("karaoke party", ["social", "arts"]),
    ("fall festival food trucks music", ["social"]),
    ("ice cream social meet the club", ["social"]),
    ("bonfire smores hangout", ["social"]),
    # sports
    ("intramural soccer tournament sign up teams", ["sports"]),
    ("yoga on the green fitness class", ["sports", "wellness"]),
    ("5k fun run charity race", ["sports", "service"]),
    ("rock climbing trip outdoor adventure club", ["sports"]),
    ("basketball pickup game rec center", ["sports"]),
    ("hiking kennesaw mountain outdoors", ["sports", "social"]),
    ("esports watch party football game tailgate", ["sports", "social"]),
    # faith
    ("bible study fellowship worship", ["faith"]),
    ("interfaith dialogue prayer meditation", ["faith", "culture"]),
    ("muslim student association iftar dinner", ["faith", "culture", "social"]),
    ("catholic campus ministry mass", ["faith"]),
    ("hillel shabbat dinner jewish students", ["faith", "culture", "social"]),
    ("christian fellowship worship night praise", ["faith", "social"]),
    ("religious life retreat spiritual growth", ["faith"]),
    ("worship music night followed by games and snacks fellowship", ["faith", "social"]),
    ("campus ministry social hangout games pizza worship", ["faith", "social"]),
    ("church youth fellowship worship and social night", ["faith", "social"]),
    # service
    ("volunteer food pantry donation drive", ["service"]),
    ("community cleanup service project", ["service"]),
    ("habitat for humanity build day", ["service"]),
    ("blood drive red cross donate", ["service", "wellness"]),
    ("tutoring kids mentoring outreach", ["service"]),
    ("canned food drive charity fundraiser", ["service"]),
    # culture
    ("hispanic heritage month celebration", ["culture", "social"]),
    ("black student union cultural showcase", ["culture", "arts"]),
    ("international students night food from around the world", ["culture", "social"]),
    ("diwali festival of lights celebration", ["culture", "faith", "social"]),
    ("lunar new year festival", ["culture", "social"]),
    ("lgbtq pride alliance meeting", ["culture", "social"]),
    ("asian student association culture night", ["culture"]),
    ("language exchange conversation table spanish", ["culture", "academic"]),
    # wellness
    ("mental health awareness stress relief therapy dogs", ["wellness"]),
    ("mindfulness meditation session", ["wellness"]),
    ("healthy cooking class nutrition", ["wellness"]),
    ("sleep and self care workshop counseling", ["wellness"]),
    ("flu shots health clinic", ["wellness"]),
    # gaming
    ("smash bros tournament esports", ["gaming"]),
    ("board games and tabletop dungeons and dragons", ["gaming", "social"]),
    ("league of legends esports team tryouts", ["gaming"]),
    ("chess club rapid tournament", ["gaming", "academic"]),
    ("video game development jam", ["gaming", "tech"]),
    # leadership
    ("student government association meeting elections", ["leadership"]),
    ("leadership summit officer training", ["leadership"]),
    ("club officer workshop running meetings", ["leadership"]),
    ("emerging leaders retreat", ["leadership"]),
    ("public speaking toastmasters", ["leadership", "career"]),
]
