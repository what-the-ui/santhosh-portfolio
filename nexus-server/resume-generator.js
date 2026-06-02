const axios = require('axios');

const BASE_RESUME = `
Santhosh Rajendran
santhosh.r777@live.in | +91 989 424 9490 | www.santhoshr.com | Chennai, India
Portfolio password: w3lcome!

SUMMARY
Product Design Manager with 10+ years of experience leading high-performing design teams and delivering user-centric products across web and mobile. Proven track record of driving business impact through design strategy, improving key metrics like conversion, engagement, and user activation. Strong collaborator with product and engineering leadership, with a focus on scaling design systems and mentoring designers.

SKILLS
Design Leadership, UX & UI Design, Product & Strategy, Research & Data, Customer Journey Mapping, Hiring & Team Scaling, Stakeholder Alignment, Design Critique, Design Operations, Data-driven Design, Marketplace UX

EXPERIENCE

Poshmark India Private Ltd. — Manager, Product Design (2024 - Present)
- Lead and scale a team of 4 designers across multiple product areas, driving design quality and delivery efficiency, contributing to 18% YoY DAU growth.
- Defined marketplace design strategy, improving listing completion by 31%.
- Partnered with product and engineering to deliver high-impact initiatives and scale a design system, reducing inconsistencies by 35%.
- Establish team processes including design critiques, planning, and reviews to improve execution.
- Mentor designers and support career growth, improving team capability and output.

Poshmark India Private Ltd. — Lead Product Designer (2022 - 2024)
- Owned end-to-end design for core marketplace journeys including listing, discovery, and onboarding.
- Led cross-functional collaboration to define product direction and improve user experience.
- Identified key friction points through research and translated insights into product improvements.
- Delivered UX improvements that increased seller activation and improved conversion flows.
- Mentored junior designers and elevated overall design quality within the team.

Poshmark India Private Ltd. — Senior Product Designer (2020 - 2022)
- Designed scalable web and mobile experiences across key product flows.
- Improved usability of complex workflows, reducing friction in core user actions.
- Conducted competitive analysis to identify opportunities for product enhancements.
- Presented design solutions to stakeholders and drove alignment across teams.

Poshmark India Private Ltd. — Product Designer (2017 - 2020)
- Executed design solutions for new features across core product areas.
- Collaborated closely with engineering to ensure high-quality implementation.
- Contributed to improving usability and consistency across the product.

AnywhereWorks — Product Designer (2014 - 2017)
- Created wireframes, visual designs, and interaction flows for digital products.
- Iterated on designs based on user feedback and usability insights.
- Built strong foundations in user-centered design and interface design.

AnywhereWorks — Product Design Intern (2014, 3 months)
- Supported senior designers in creating wireframes and visual designs.
- Assisted in user research and usability testing activities.

KEY ACHIEVEMENTS
- Led and scaled a team of 4 designers across multiple product areas
- Improved seller listing completion by 31%
- Reduced listing creation time by 50%
- Increased new seller activation by 13%
- Scaled team from 2 to 6 designers
- Contributed to 18% YoY DAU growth
- Reduced design inconsistencies by 35% through design system work

EDUCATION
SRM Institute of Science and Technology — B.B.A Digital Marketing (Expected 2027)
`;

async function generateTailoredResume(jobTitle, companyName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const prompt = `You are an expert ATS resume writer. Given the base resume below, create a tailored ATS-friendly version optimized for the role: "${jobTitle}" at "${companyName}".

Rules:
- Keep all real experience, dates, company names, and metrics EXACTLY as written — never fabricate anything
- Reorder and reweight bullet points to lead with the most relevant accomplishments for this role
- Rewrite the summary (2-3 sentences) to directly address what "${jobTitle}" at "${companyName}" needs
- Add a "Core Competencies" section with 8-12 keywords/phrases most relevant to this role (drawn from the resume, not invented)
- Keep the EDUCATION section exactly as written — do not change, move, or omit it
- Use clean plain formatting with clear section headers — no tables, no columns, no special characters
- Output ONLY the resume text, no commentary

BASE RESUME:
${BASE_RESUME}

Output the tailored resume now:`;

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 2048 } },
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  return res.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

module.exports = { generateTailoredResume };
