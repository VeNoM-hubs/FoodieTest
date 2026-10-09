(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.FoodieData = data;
})(typeof self !== 'undefined' ? self : this, function () {
  const RESTAURANTS = [
    {
      id: 'burger-corner', name: 'Burger Corner', emoji: '🍔', cuisines: ['Burgers', 'American', 'Fast Food'],
      area: 'T. Nagar', rating: 4.3, eta: '25-30 mins', costForTwo: 400, tint: '#ffe3c2',
      menu: [
        { id: 'bc-1', name: 'Classic Chicken Burger', price: 219, veg: false, emoji: '🍔', bestseller: true, desc: 'Crispy chicken patty, lettuce, cheese and house mayo.' },
        { id: 'bc-2', name: 'Veg Crunch Burger', price: 149, veg: true, emoji: '🍔', desc: 'Crunchy veg patty with onions and tangy sauce.' },
        { id: 'bc-3', name: 'Cheese Burst Burger', price: 249, veg: true, emoji: '🧀', desc: 'Molten cheese core with jalapeños.' },
        { id: 'bc-4', name: 'Peri Peri Fries', price: 119, veg: true, emoji: '🍟', desc: 'Fries tossed in spicy peri peri seasoning.' },
        { id: 'bc-5', name: 'Chocolate Shake', price: 129, veg: true, emoji: '🥤', desc: 'Thick Belgian chocolate shake.' },
      ],
    },
    {
      id: 'biryani-junction', name: 'Biryani Junction', emoji: '🍛', cuisines: ['Biryani', 'Mughlai', 'North Indian'],
      area: 'Anna Nagar', rating: 4.5, eta: '30-35 mins', costForTwo: 500, tint: '#ffd9cc',
      menu: [
        { id: 'bj-1', name: 'Veg Biryani', price: 180, veg: true, emoji: '🍚', bestseller: true, desc: 'Fragrant basmati rice with mixed vegetables and spices.' },
        { id: 'bj-2', name: 'Chicken Dum Biryani', price: 250, veg: false, emoji: '🍗', bestseller: true, desc: 'Slow-cooked dum biryani with tender chicken.' },
        { id: 'bj-3', name: 'Mutton Biryani', price: 350, veg: false, emoji: '🍖', desc: 'Hyderabadi style mutton biryani.' },
        { id: 'bj-4', name: 'Boondi Raita', price: 49, veg: true, emoji: '🥣', desc: 'Chilled curd with crispy boondi.' },
        { id: 'bj-5', name: 'Gulab Jamun (2 pcs)', price: 70, veg: true, emoji: '🍡', desc: 'Soft khoya dumplings in sugar syrup.' },
      ],
    },
    {
      id: 'cafe-mocha', name: 'Café Mocha', emoji: '☕', cuisines: ['Cafe', 'Beverages', 'Snacks'],
      area: 'Besant Nagar', rating: 4.2, eta: '20-25 mins', costForTwo: 300, tint: '#e9dccd',
      menu: [
        { id: 'cm-1', name: 'Veg Club Sandwich', price: 99, veg: true, emoji: '🥪', bestseller: true, desc: 'Triple-layer grilled sandwich with veggies.' },
        { id: 'cm-2', name: 'Cold Coffee', price: 100, veg: true, emoji: '🧋', desc: 'Creamy iced coffee.' },
        { id: 'cm-3', name: 'Chocolate Brownie', price: 99, veg: true, emoji: '🍫', desc: 'Warm fudgy brownie.' },
        { id: 'cm-4', name: 'Masala Chai', price: 40, veg: true, emoji: '🍵', desc: 'Spiced Indian tea.' },
      ],
    },
    {
      id: 'dosa-darbar', name: 'Dosa Darbar', emoji: '🥞', cuisines: ['South Indian', 'Breakfast'],
      area: 'Mylapore', rating: 4.6, eta: '15-20 mins', costForTwo: 200, tint: '#fff1c2',
      menu: [
        { id: 'dd-1', name: 'Masala Dosa', price: 90, veg: true, emoji: '🥞', bestseller: true, desc: 'Crisp dosa with potato masala, chutney and sambar.' },
        { id: 'dd-2', name: 'Ghee Roast Dosa', price: 150, veg: true, emoji: '🥞', desc: 'Paper-thin dosa roasted in ghee.' },
        { id: 'dd-3', name: 'Idli Vada Combo', price: 70, veg: true, emoji: '🍘', desc: '2 idlis and 1 medu vada.' },
        { id: 'dd-4', name: 'Filter Coffee', price: 40, veg: true, emoji: '☕', desc: 'Classic South Indian filter coffee.' },
      ],
    },
    {
      id: 'pizza-point', name: 'Pizza Point', emoji: '🍕', cuisines: ['Pizzas', 'Italian'],
      area: 'Adyar', rating: 4.1, eta: '30-40 mins', costForTwo: 600, tint: '#ffd6d6',
      menu: [
        { id: 'pp-1', name: 'Margherita Pizza', price: 199, veg: true, emoji: '🍕', bestseller: true, desc: 'Classic tomato, mozzarella and basil.' },
        { id: 'pp-2', name: 'Farmhouse Pizza', price: 299, veg: true, emoji: '🍕', desc: 'Onion, capsicum, tomato and mushroom.' },
        { id: 'pp-3', name: 'Chicken Tikka Pizza', price: 349, veg: false, emoji: '🍕', desc: 'Tandoori chicken tikka with onions.' },
        { id: 'pp-4', name: 'Garlic Bread', price: 119, veg: true, emoji: '🥖', desc: 'Toasted garlic bread with herbs.' },
      ],
    },
    {
      id: 'wok-express', name: 'Wok Express', emoji: '🍜', cuisines: ['Chinese', 'Asian'],
      area: 'Velachery', rating: 4.0, eta: '25-35 mins', costForTwo: 450, tint: '#dff3df',
      menu: [
        { id: 'we-1', name: 'Veg Hakka Noodles', price: 160, veg: true, emoji: '🍜', bestseller: true, desc: 'Wok-tossed noodles with vegetables.' },
        { id: 'we-2', name: 'Chilli Chicken', price: 220, veg: false, emoji: '🌶️', desc: 'Indo-Chinese dry chilli chicken.' },
        { id: 'we-3', name: 'Veg Manchurian', price: 170, veg: true, emoji: '🥟', desc: 'Veg balls in spicy manchurian gravy.' },
        { id: 'we-4', name: 'Fried Rice', price: 150, veg: true, emoji: '🍚', desc: 'Classic egg-free veg fried rice.' },
      ],
    },
  ];

  const CATEGORIES = [
    { label: 'Biryani', emoji: '🍛' },
    { label: 'Burgers', emoji: '🍔' },
    { label: 'Pizzas', emoji: '🍕' },
    { label: 'South Indian', emoji: '🥞' },
    { label: 'Chinese', emoji: '🍜' },
    { label: 'Cafe', emoji: '☕' },
  ];

  function findRestaurant(id) {
    return RESTAURANTS.find((r) => r.id === id) || null;
  }

  function findDish(dishId) {
    for (const r of RESTAURANTS) {
      const dish = r.menu.find((d) => d.id === dishId);
      if (dish) return { restaurant: r, dish };
    }
    return null;
  }

  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { restaurants: [], dishes: [] };
    const restaurants = RESTAURANTS.filter((r) =>
      r.name.toLowerCase().includes(q) || r.cuisines.some((c) => c.toLowerCase().includes(q)));
    const dishes = [];
    RESTAURANTS.forEach((r) => r.menu.forEach((d) => {
      if (d.name.toLowerCase().includes(q)) dishes.push({ restaurant: r, dish: d });
    }));
    return { restaurants, dishes };
  }

  return { RESTAURANTS, CATEGORIES, findRestaurant, findDish, search };
});
