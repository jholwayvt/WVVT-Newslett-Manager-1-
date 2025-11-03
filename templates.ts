export interface NewsletterTemplate {
  id: string;
  name: string;
  description: string;
  html: string;
}

export const TEMPLATES: NewsletterTemplate[] = [
  {
    id: 'template-1',
    name: 'Simple Announcement',
    description: 'A clean, single-column template for quick updates and announcements.',
    html: `
<h1 style="color: #333; font-family: Arial, sans-serif;">Main Announcement Title</h1>
<p style="color: #555; font-family: Arial, sans-serif; line-height: 1.6;">
  This is a paragraph for your main content. You can describe your announcement, share news, or provide updates here. Keep it concise and to the point.
</p>
<p style="color: #555; font-family: Arial, sans-serif; line-height: 1.6;">
  Feel free to add more paragraphs as needed.
</p>
<a href="#" style="background-color: #007bff; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px; font-family: Arial, sans-serif; display: inline-block; margin-top: 10px;">
  Call to Action
</a>
    `
  },
  {
    id: 'template-2',
    name: 'Two-Column Feature',
    description: 'A versatile template to showcase two different features or articles side-by-side.',
    html: `
<table width="100%" border="0" cellpadding="0" cellspacing="0">
  <tr>
    <td align="center">
      <h1 style="color: #333; font-family: Arial, sans-serif; margin-bottom: 20px;">Weekly Feature</h1>
    </td>
  </tr>
  <tr>
    <td>
      <table width="100%" border="0" cellpadding="10" cellspacing="0">
        <tr>
          <td valign="top" width="50%" style="font-family: Arial, sans-serif; color: #555;">
            <h2 style="color: #333; margin-top: 0;">Feature One</h2>
            <p>This is the description for the first feature. You can include an image above or below this text.</p>
            <a href="#">Read More</a>
          </td>
          <td valign="top" width="50%" style="font-family: Arial, sans-serif; color: #555;">
            <h2 style="color: #333; margin-top: 0;">Feature Two</h2>
            <p>This is the description for the second feature. It's a great way to present parallel information.</p>
            <a href="#">Read More</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
    `
  },
  {
    id: 'template-3',
    name: 'Hero Image & Content',
    description: 'A visually engaging template with a prominent hero image to capture attention.',
    html: `
<div style="text-align: center;">
  <img src="https://via.placeholder.com/600x300" alt="Hero Image" style="max-width: 100%; height: auto; border-radius: 8px;" />
</div>
<h1 style="color: #333; font-family: Arial, sans-serif; margin-top: 20px;">Captivating Headline</h1>
<p style="color: #555; font-family: Arial, sans-serif; line-height: 1.6;">
  This template starts with a large, eye-catching image. Use it to showcase a new product, a special event, or a stunning visual that represents your brand. The content follows below, providing more details.
</p>
<p style="text-align: center; margin-top: 20px;">
  <a href="#" style="background-color: #28a745; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-family: Arial, sans-serif; display: inline-block;">
    Learn More
  </a>
</p>
    `
  },
    {
    id: 'template-4',
    name: 'Product Showcase',
    description: 'Highlight a specific product with an image, description, and a clear call-to-action button.',
    html: `
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f9f9f9; padding: 20px; border-radius: 8px;">
    <tr>
        <td width="40%" valign="top">
            <img src="https://via.placeholder.com/250x250" alt="Product Image" style="max-width: 100%; height: auto; border-radius: 8px;">
        </td>
        <td width="60%" valign="top" style="padding-left: 20px; font-family: Arial, sans-serif;">
            <h2 style="color: #333; margin-top: 0;">Product Name</h2>
            <p style="color: #666; line-height: 1.5;">A detailed and persuasive description of your product goes here. Explain its benefits, features, and what makes it special.</p>
            <p style="font-size: 24px; color: #007bff; font-weight: bold; margin: 15px 0;">$99.99</p>
            <a href="#" style="background-color: #ffc107; color: #333; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Buy Now</a>
        </td>
    </tr>
</table>
    `
  }
];
