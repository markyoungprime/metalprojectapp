console.log('Starting server...');

const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000; // Use Render's dynamic port or default to 3000

const apiToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjE3MTYzNDYwOCwiYWFpIjoxMSwidWlkIjozMjI3MzUzNSwiaWFkIjoiMjAyMi0wNy0yMlQwMjowMTo0NC4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MTI4NTQzMDksInJnbiI6InVzZTEifQ.Vlr1BkyzL8ytm3nYd9pzqTRdRf7PuOrp3qP8KJGKYv0';
const boardId = '2975285092';
const apiUrl = 'https://api.monday.com/v2';
const today = new Date('2025-03-16T00:00:00Z'); // Explicit UTC
const maxItems = 3000; // Keep higher limit as preferred

app.use(express.json()); // Enable JSON body parsing

app.get('/projects', async (req, res) => {
  console.log('Projects route hit!');
  let allItems = [];
  let cursor = null;
  const limit = 250; // Increased to reduce API calls

  try {
    do {
      const columnIds = ['label4', 'timeline', 'status', 'site_address_mkn23t2r', 'long_text_mkp2xwpw', 'link3', 'numbers_14', 'metal_color', 'dropdown7', 'metal_profile__1', 'dropdown1', 'numeric_mkp4xeef', 'status_18'];
      const query = `
        query {
          boards(ids: ${JSON.stringify([boardId])}) {
            items_page(limit: ${limit}${cursor ? `, cursor: "${cursor}"` : ''}) {
              cursor
              items {
                id
                name
                group { id title }
                column_values(ids: ${JSON.stringify(columnIds)}) {
                  id
                  value
                  text
                }
              }
            }
          }
        }
      `.trim();

      console.log('Raw query string:', query);
      const response = await axios.post(apiUrl, { query }, {
        headers: {
          'Authorization': apiToken,
          'Content-Type': 'application/json',
          'API-Version': '2023-04'
        }
      });

      console.log('Full API response:', JSON.stringify(response.data, null, 2));
      if (!response.data.data || !response.data.data.boards || !response.data.data.boards[0] || !response.data.data.boards[0].items_page) {
        throw new Error('Invalid API response structure: ' + JSON.stringify(response.data));
      }

      const itemsPage = response.data.data.boards[0].items_page;
      itemsPage.items.forEach(item => {
        console.log(`Item ${item.id} - ${item.name}:`, item.column_values.filter(cv => cv.id === 'status_18' || cv.id === 'numeric_mkp4xeef'));
      });
      allItems = allItems.concat(itemsPage.items);
      cursor = itemsPage.cursor;
      console.log(`Fetched ${itemsPage.items.length} items, cursor: ${cursor}`);

      if (allItems.length >= maxItems) {
        console.log(`Reached maximum item limit of ${maxItems}, stopping pagination`);
        break;
      }
    } while (cursor);

    const parsedItems = allItems.map(item => ({
      id: item.id,
      name: item.name,
      group: item.group ? item.group.title : 'No Group',
      columns: item.column_values.map(col => ({
        id: col.id,
        value: col.value ? JSON.parse(col.value) : null,
        text: col.text || ''
      }))
    }));

    // Filter for Metal Boys only
    const metalBoysItems = parsedItems.filter(item => {
      const cols = Object.fromEntries(item.columns.map(c => [c.id, c]));
      const crew = cols['label4'] ? cols['label4'].text : '';
      return crew === 'Metal Boys';
    });
    console.log(`Filtered to ${metalBoysItems.length} Metal Boys items`);

    // No 90-day filter as per preference
    const recentItems = metalBoysItems;
    console.log(`Keeping all ${recentItems.length} items (no 90-day filter)`);

    const scheduledItems = recentItems.filter(item => {
      const cols = Object.fromEntries(item.columns.map(c => [c.id, c]));
      const crew = cols['label4'] ? cols['label4'].text : '';
      const timelineValue = cols['timeline'] && cols['timeline'].value ? cols['timeline'].value : {};
      const timelineStart = timelineValue.from && typeof timelineValue.from === 'string' ? new Date(timelineValue.from) : null;
      const timelineEnd = timelineValue.to && typeof timelineValue.to === 'string' ? new Date(timelineValue.to) : timelineStart;
      const status = cols['status'] ? cols['status'].text.trim() : '';

      const isMetalBoys = crew === 'Metal Boys';
      const hasTimeline = timelineStart !== null && !isNaN(timelineStart.getTime());
      const isCurrentOrFuture = hasTimeline && !isNaN(timelineStart.getTime()) && (timelineEnd ? timelineEnd >= today : timelineStart >= today);
      const isValidStatus = ['Contract Signed - Start Production', 'Project In-Progress', 'Finalize'].includes(status);

      const result = isMetalBoys && hasTimeline && isCurrentOrFuture && isValidStatus;
      console.log(`Filtering scheduled ${item.name}: Crew=${crew}, TimelineStart=${timelineStart}, TimelineEnd=${timelineEnd}, Status=${status}, IsMetalBoys=${isMetalBoys}, HasTimeline=${hasTimeline}, IsCurrentOrFuture=${isCurrentOrFuture}, IsValidStatus=${isValidStatus}, Result=${result}`);
      return result;
    });

    // Exclude scheduled items from unscheduled filtering
    const scheduledItemIds = new Set(scheduledItems.map(item => item.id));
    const unscheduledItems = recentItems.filter(item => {
      if (scheduledItemIds.has(item.id)) {
        return false; // Skip items already in scheduled
      }

      const cols = Object.fromEntries(item.columns.map(c => [c.id, c]));
      const crew = cols['label4'] ? cols['label4'].text : '';
      const timelineValue = cols['timeline'] && cols['timeline'].value ? cols['timeline'].value : {};
      const timelineStart = timelineValue.from && typeof timelineValue.from === 'string' ? new Date(timelineValue.from) : null;
      const status = cols['status'] ? cols['status'].text.trim() : '';

      const isMetalBoys = crew === 'Metal Boys';
      const hasTimeline = timelineStart === null || (timelineStart && isNaN(timelineStart.getTime()));
      const isValidStatus = ['Contract Signed - Start Production', 'Project In-Progress', 'Finalize'].includes(status);

      const result = isMetalBoys && hasTimeline && isValidStatus;
      console.log(`Filtering unscheduled ${item.name}: Crew=${crew}, TimelineStart=${timelineStart}, Status=${status}, IsMetalBoys=${isMetalBoys}, HasTimeline=${hasTimeline}, IsValidStatus=${isValidStatus}, Result=${result}`);
      return result;
    });

    const responseData = { scheduled: scheduledItems, unscheduled: unscheduledItems };
    console.log(`Fetched ${allItems.length} total items, ${recentItems.length} recent items, ${scheduledItems.length} scheduled, ${unscheduledItems.length} unscheduled`);
    res.json(responseData);
  } catch (error) {
    console.error('Error in /projects route:', error.message);
    if (error.response) {
      console.error('API error response:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).send('Error fetching project data: ' + error.message);
  }
});

// Endpoint to fetch updates for a specific item
app.get('/updates/:itemId', async (req, res) => {
  const { itemId } = req.params;
  console.log(`Fetching updates for itemId: ${itemId}`);

  try {
    const query = `
      query {
        items(ids: "${itemId}") {
          id
          updates(limit: 10) {
            id
            body
            created_at
            creator { name }
          }
        }
      }
    `;

    console.log('Sending updates query:', query);
    const response = await axios.post(apiUrl, { query }, {
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
        'API-Version': '2023-04'
      }
    });

    console.log('Updates API response:', JSON.stringify(response.data, null, 2));
    if (!response.data.data || !response.data.data.items || response.data.data.items.length === 0) {
      throw new Error('Invalid API response structure or no items found');
    }

    const updates = response.data.data.items[0].updates || [];
    console.log(`Retrieved ${updates.length} updates for item ${itemId}:`, updates);
    res.json(updates);
  } catch (error) {
    console.error('Error in /updates route:', error.message);
    if (error.response) {
      console.error('API error response:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({ error: 'Error fetching updates', details: error.message });
  }
});

// Endpoint to submit notes
app.post('/submit-note', async (req, res) => {
  const { itemId, noteText } = req.body;
  console.log(`Received note submission for itemId: ${itemId}, noteText: ${noteText}`);

  if (!itemId || !noteText || !noteText.trim()) {
    return res.status(500).json({ error: 'Item ID and valid note text are required' });
  }

  try {
    const query = `
      mutation {
        create_update(item_id: ${itemId}, body: "${noteText.replace(/"/g, '\\"')}") {
          id
        }
      }
    `;

    const response = await axios.post(apiUrl, { query }, {
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
        'API-Version': '2023-04'
      }
    });

    if (response.data.errors) {
      console.error('API errors:', response.data.errors);
      return res.status(500).json({ error: 'Failed to create update', details: response.data.errors });
    }

    console.log('Note submitted successfully:', response.data);
    res.json({ success: true, updateId: response.data.data.create_update.id });
  } catch (error) {
    console.error('Error submitting note:', error.message);
    if (error.response) {
      console.error('API error response:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({ error: 'Error submitting note', details: error.message });
  }
});

app.get('/', (req, res) => {
  console.log('Serving index.html');
  res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});