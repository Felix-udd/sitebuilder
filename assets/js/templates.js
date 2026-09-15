// Built-in template gallery.
// Each template's `content` is identical in shape to what api/save.php
// stores and editor.js loads: { blocks: [...], settings: {...} }.
// Picking a template just creates a new page pre-filled with this content -
// from then on it's an ordinary, fully editable page.

const TEMPLATES = {
  startup: {
    name: 'Startup Landing',
    description: 'Hero, feature columns, and a call to action.',
    content: {
      settings: { pageTitle: 'Startup Landing', pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' },
      blocks: [
        { id: 't1', type: 'hero', props: {
          heading: 'Build something people want',
          subheading: 'The fastest way to launch your idea, without writing a line of code.',
          buttonText: 'Get started free',
          buttonUrl: '#',
          bgColor: '#1D2027', textColor: '#FFFFFF', align: 'center'
        }},
        { id: 't2', type: 'spacer', props: { height: 30 } },
        { id: 't3', type: 'heading', props: { text: 'Why teams choose us', level: 'h2', align: 'center', color: '#1A1A1A' } },
        { id: 't4', type: 'spacer', props: { height: 10 } },
        { id: 't5', type: 'columns', props: {
          leftText: 'Fast setup\nGo from idea to live page in minutes, not weeks.',
          rightText: 'No code required\nDrag, drop, and customize everything visually.'
        }},
        { id: 't6', type: 'spacer', props: { height: 20 } },
        { id: 't7', type: 'divider', props: { color: '#E0E0E0', thickness: 1 } },
        { id: 't8', type: 'spacer', props: { height: 20 } },
        { id: 't9', type: 'text', props: { text: '"This tool cut our launch time in half."', align: 'center', color: '#333333', fontSize: 18 } },
        { id: 't10', type: 'spacer', props: { height: 10 } },
        { id: 't11', type: 'button', props: { text: 'Start your free trial', url: '#', bgColor: '#7C6FF0', textColor: '#FFFFFF', align: 'center' } },
        { id: 't12', type: 'spacer', props: { height: 40 } },
        { id: 't13', type: 'text', props: { text: '© 2026 Your Company', align: 'center', color: '#999999', fontSize: 13 } }
      ]
    }
  },

  portfolio: {
    name: 'Portfolio',
    description: 'Intro, project showcase, and contact button.',
    content: {
      settings: { pageTitle: 'Portfolio', pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' },
      blocks: [
        { id: 't1', type: 'hero', props: {
          heading: 'Jane Doe — Product Designer',
          subheading: 'Selected work, 2021–2026',
          buttonText: '', buttonUrl: '',
          bgColor: '#F5F4F0', textColor: '#1A1A1A', align: 'left'
        }},
        { id: 't2', type: 'spacer', props: { height: 20 } },
        { id: 't3', type: 'heading', props: { text: 'Selected Work', level: 'h2', align: 'left', color: '#1A1A1A' } },
        { id: 't4', type: 'image', props: { src: '', alt: 'Project one screenshot', width: '100%', align: 'center' } },
        { id: 't5', type: 'text', props: { text: 'Project One — a short description of the problem, approach, and outcome.', align: 'left', color: '#555555', fontSize: 15 } },
        { id: 't6', type: 'spacer', props: { height: 20 } },
        { id: 't7', type: 'divider', props: { color: '#E0E0E0', thickness: 1 } },
        { id: 't8', type: 'spacer', props: { height: 20 } },
        { id: 't9', type: 'image', props: { src: '', alt: 'Project two screenshot', width: '100%', align: 'center' } },
        { id: 't10', type: 'text', props: { text: 'Project Two — a short description of the problem, approach, and outcome.', align: 'left', color: '#555555', fontSize: 15 } },
        { id: 't11', type: 'spacer', props: { height: 40 } },
        { id: 't12', type: 'heading', props: { text: 'Get in touch', level: 'h3', align: 'center', color: '#1A1A1A' } },
        { id: 't13', type: 'button', props: { text: 'Email me', url: 'mailto:hello@example.com', bgColor: '#1A1A1A', textColor: '#FFFFFF', align: 'center' } }
      ]
    }
  },

  comingSoon: {
    name: 'Coming Soon',
    description: 'Minimal centered announcement page.',
    content: {
      settings: { pageTitle: 'Coming Soon', pageBackground: '#15171C', fontFamily: 'Arial, Helvetica, sans-serif' },
      blocks: [
        { id: 't1', type: 'hero', props: {
          heading: "Something's coming",
          subheading: "We're putting the finishing touches on it. Check back soon.",
          buttonText: 'Notify me',
          buttonUrl: '#',
          bgColor: '#15171C', textColor: '#FFFFFF', align: 'center'
        }},
        { id: 't2', type: 'spacer', props: { height: 20 } },
        { id: 't3', type: 'text', props: { text: 'Follow along for updates.', align: 'center', color: '#9a9a9a', fontSize: 15 } },
        { id: 't4', type: 'spacer', props: { height: 30 } },
        { id: 't5', type: 'divider', props: { color: '#2a2e38', thickness: 1 } },
        { id: 't6', type: 'spacer', props: { height: 20 } },
        { id: 't7', type: 'text', props: { text: '© 2026 Your Company', align: 'center', color: '#666666', fontSize: 13 } }
      ]
    }
  },
  consultancy: {
    name: 'Business Consultancy',
    description: 'Light, minimal layout for a consultancy or advisory firm.',
    content: {
      settings: { pageTitle: 'Business Consultancy', pageBackground: '#FFFFFF', fontFamily: 'Arial, Helvetica, sans-serif' },
      blocks: [
        { id: 'c1', type: 'hero', props: {
          heading: 'Strategic clarity for growing businesses',
          subheading: 'We help ambitious companies make sharper decisions, faster.',
          buttonText: 'Book a consultation',
          buttonUrl: '#contact',
          bgColor: '#FAFAF9', textColor: '#1F2937', align: 'left'
        }},
        { id: 'c2', type: 'spacer', props: { height: 40 } },

        { id: 'c3', type: 'heading', props: { text: 'Services', level: 'h2', align: 'left', color: '#1F2937' } },
        { id: 'c4', type: 'spacer', props: { height: 10 } },
        { id: 'c5', type: 'columns', props: {
          leftText: 'Strategy & Planning\nWe help you define a clear path forward with data-backed strategic plans.',
          rightText: 'Operations & Growth\nWe streamline operations so your team can focus on what matters most.'
        }},
        { id: 'c6', type: 'spacer', props: { height: 16 } },
        { id: 'c7', type: 'columns', props: {
          leftText: 'Financial Advisory\nClear, practical financial guidance to support confident decision-making.',
          rightText: 'Change Management\nWe help teams adapt smoothly through periods of transition and growth.'
        }},

        { id: 'c8', type: 'spacer', props: { height: 40 } },
        { id: 'c9', type: 'divider', props: { color: '#E5E5E0', thickness: 1 } },
        { id: 'c10', type: 'spacer', props: { height: 40 } },

        { id: 'c11', type: 'heading', props: { text: 'Why work with us', level: 'h2', align: 'left', color: '#1F2937' } },
        { id: 'c12', type: 'text', props: {
          text: 'With over a decade of experience across industries, our team combines rigorous analysis with practical, hands-on execution. We work as an extension of your team, not a detached outside voice.',
          align: 'left', color: '#4B5563', fontSize: 16
        }},
        { id: 'c13', type: 'spacer', props: { height: 20 } },
        { id: 'c14', type: 'image', props: { src: '', alt: 'Our team at work', width: '100%', align: 'center' } },

        { id: 'c15', type: 'spacer', props: { height: 40 } },
        { id: 'c16', type: 'heading', props: { text: 'What clients say', level: 'h3', align: 'center', color: '#1F2937' } },
        { id: 'c17', type: 'text', props: {
          text: '"Working with this team gave us the clarity and confidence to make decisions we had been putting off for months."',
          align: 'center', color: '#4B5563', fontSize: 17
        }},

        { id: 'c18', type: 'spacer', props: { height: 40 } },
        { id: 'c19', type: 'divider', props: { color: '#E5E5E0', thickness: 1 } },
        { id: 'c20', type: 'spacer', props: { height: 40 } },

        { id: 'c21', type: 'heading', props: { text: "Let's talk", level: 'h2', align: 'center', color: '#1F2937' } },
        { id: 'c22', type: 'text', props: {
          text: 'Schedule a free 30-minute consultation to see if we\u2019re a good fit for your business.',
          align: 'center', color: '#4B5563', fontSize: 16
        }},
        { id: 'c23', type: 'spacer', props: { height: 16 } },
        { id: 'c24', type: 'button', props: { text: 'Book a consultation', url: '#contact', bgColor: '#2F4858', textColor: '#FFFFFF', align: 'center' } },

        { id: 'c25', type: 'spacer', props: { height: 50 } },
        { id: 'c26', type: 'text', props: { text: '\u00A9 2026 Your Consultancy. All rights reserved.', align: 'center', color: '#9CA3AF', fontSize: 13 } }
      ]
    }
  }
};
